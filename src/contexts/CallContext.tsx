import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWebRTC } from "@/hooks/useWebRTC";
import { useCallLogger } from "@/hooks/useCallLogger";
import { toast } from "sonner";

export type CallState = "idle" | "outgoing" | "incoming" | "active";
export type CallType = "audio" | "video";

interface CallParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
}

interface CallContextType {
  callState: CallState;
  callType: CallType;
  isGroupCall: boolean;
  participants: CallParticipant[];
  caller: CallParticipant | null;
  conversationId: string | null;
  callDuration: number;
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isCameraOff: boolean;
  startCall: (conversationId: string, type: CallType, targetUsers: CallParticipant[], isGroup: boolean) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
}

const CallContext = createContext<CallContextType | null>(null);

export const useCall = () => {
  const ctx = useContext(CallContext);
  if (!ctx) throw new Error("useCall must be inside CallProvider");
  return ctx;
};

// ── Heartbeat interval (ms) ──
const HEARTBEAT_INTERVAL = 5_000;
const HEARTBEAT_TIMEOUT = 15_000;

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, membership } = useAuth();
  const webrtc = useWebRTC();
  const logger = useCallLogger();

  const [callState, setCallState] = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");
  const [callType, setCallType] = useState<CallType>("audio");
  const [isGroupCall, setIsGroupCall] = useState(false);
  const [participants, setParticipants] = useState<CallParticipant[]>([]);
  const [caller, setCaller] = useState<CallParticipant | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callLogId, setCallLogId] = useState<string | null>(null);

  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const ringTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null);
  const lastHeartbeatRef = useRef<number>(0);
  const heartbeatCheckRef = useRef<NodeJS.Timeout | null>(null);

  const processedSignalsRef = useRef<Set<string>>(new Set());
  const callRoleRef = useRef<"caller" | "callee" | null>(null);
  // Guard: has the caller already sent the initial offer for this session?
  const offerSentRef = useRef(false);

  // Wire logger
  useEffect(() => { webrtc.setLogger(logger.log); }, [webrtc.setLogger, logger.log]);

  const setCallStateTracked = useCallback((s: CallState) => {
    logger.log("state_change", { from: callStateRef.current, to: s });
    callStateRef.current = s;
    setCallState(s);
  }, [logger]);

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) { clearTimeout(ringTimeoutRef.current); ringTimeoutRef.current = null; }
  }, []);

  // ── Duration timer ──
  useEffect(() => {
    if (callState === "active") {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  // ── Heartbeat ──
  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current) { clearInterval(heartbeatRef.current); heartbeatRef.current = null; }
    if (heartbeatCheckRef.current) { clearInterval(heartbeatCheckRef.current); heartbeatCheckRef.current = null; }
  }, []);

  const startHeartbeat = useCallback((channel: ReturnType<typeof supabase.channel>, myId: string) => {
    stopHeartbeat();
    lastHeartbeatRef.current = Date.now();

    heartbeatRef.current = setInterval(() => {
      channel.send({
        type: "broadcast", event: "call-signal",
        payload: { type: "heartbeat", fromUserId: myId, targetUserId: "__all__" },
      });
    }, HEARTBEAT_INTERVAL);

    heartbeatCheckRef.current = setInterval(() => {
      if (callStateRef.current !== "active") return;
      const elapsed = Date.now() - lastHeartbeatRef.current;
      if (elapsed > HEARTBEAT_TIMEOUT) {
        logger.log("heartbeat_timeout", { elapsed });
        // Don't kill call immediately — ICE restart will handle recovery
      }
    }, HEARTBEAT_INTERVAL);
  }, [stopHeartbeat, logger]);

  // ── Cleanup ──
  const cleanupCall = useCallback(() => {
    logger.log("cleanup_call");
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
    clearRingTimeout();
    stopHeartbeat();
    webrtc.cleanup();
    setCallStateTracked("idle");
    setParticipants([]);
    setCaller(null);
    setConversationId(null);
    setCallDuration(0);
    setCallLogId(null);
    callRoleRef.current = null;
    offerSentRef.current = false;
    processedSignalsRef.current.clear();
    logger.reset();
  }, [webrtc, clearRingTimeout, stopHeartbeat, logger, setCallStateTracked]);

  // ── ICE sender factory ──
  const makeIceSender = useCallback((channel: ReturnType<typeof supabase.channel>, fromUserId: string, targetUserId: string) => {
    return (candidate: RTCIceCandidate) => {
      channel.send({
        type: "broadcast", event: "call-signal",
        payload: { type: "ice-candidate", candidate: candidate.toJSON(), fromUserId, targetUserId },
      });
    };
  }, []);

  const handleConnectionLost = useCallback(() => {
    if (callStateRef.current === "active") {
      logger.log("connection_lost");
      toast.error("Соединение потеряно");
      cleanupCall();
    }
  }, [cleanupCall, logger]);

  // ── ICE restart (caller only) ──
  const handleIceRestartRequest = useCallback((remoteUserId: string) => {
    if (callRoleRef.current !== "caller") return;
    const channel = channelRef.current;
    if (!channel || !user) return;

    logger.log("ice_restart_offer", { remoteUserId });

    (async () => {
      try {
        const offer = await webrtc.createOffer(remoteUserId, makeIceSender(channel, user.id, remoteUserId), handleConnectionLost, true);
        if (!offer) return;
        channel.send({
          type: "broadcast", event: "call-signal",
          payload: { type: "offer", sdp: offer, fromUserId: user.id, targetUserId: remoteUserId, signalId: `restart-${Date.now()}` },
        });
      } catch (e: any) {
        logger.log("ice_restart_error", { error: e?.message });
      }
    })();
  }, [user, webrtc, makeIceSender, handleConnectionLost, logger]);

  useEffect(() => { webrtc.setIceRestartHandler(handleIceRestartRequest); }, [webrtc.setIceRestartHandler, handleIceRestartRequest]);

  // ── Signaling channel ──
  const setupSignalingChannel = useCallback((convId: string) => {
    if (channelRef.current) supabase.removeChannel(channelRef.current);

    const channel = supabase.channel(`call-${convId}`, { config: { broadcast: { self: false } } });

    channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
      if (!user) return;

      // Heartbeat — update timestamp, no further processing
      if (payload.type === "heartbeat") {
        if (payload.fromUserId !== user.id) lastHeartbeatRef.current = Date.now();
        return;
      }

      // Must be targeted at us
      if (payload.targetUserId !== user.id) return;

      // Deduplicate non-ICE signals
      const signalId = payload.signalId;
      if (signalId && payload.type !== "ice-candidate") {
        if (processedSignalsRef.current.has(signalId)) return;
        processedSignalsRef.current.add(signalId);
      }

      logger.log("signal_in", { type: payload.type, from: payload.fromUserId, role: callRoleRef.current });

      switch (payload.type) {
        // ── ACCEPT: callee accepted → caller creates THE ONLY initial offer ──
        case "accept": {
          if (callRoleRef.current !== "caller") break;
          // Guard: only one initial offer per call session
          if (offerSentRef.current) {
            logger.log("offer_already_sent_skipping");
            break;
          }
          offerSentRef.current = true;

          logger.log("creating_offer_after_accept", { callee: payload.fromUserId });
          try {
            const offer = await webrtc.createOffer(
              payload.fromUserId,
              makeIceSender(channel, user.id, payload.fromUserId),
              handleConnectionLost,
            );
            if (!offer) {
              logger.log("offer_creation_failed");
              offerSentRef.current = false; // allow retry
              break;
            }
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "offer", sdp: offer, fromUserId: user.id, targetUserId: payload.fromUserId, signalId: `offer-${Date.now()}` },
            });
            logger.log("offer_sent", { callee: payload.fromUserId });
          } catch (e: any) {
            logger.log("offer_error", { error: e?.message });
            offerSentRef.current = false;
          }
          break;
        }

        // ── OFFER: callee receives offer and creates answer ──
        case "offer": {
          if (callRoleRef.current !== "callee") {
            logger.log("offer_ignored_wrong_role", { role: callRoleRef.current });
            break;
          }
          try {
            const answer = await webrtc.handleOffer(
              payload.fromUserId, payload.sdp,
              makeIceSender(channel, user.id, payload.fromUserId),
              handleConnectionLost,
            );
            if (!answer) { logger.log("answer_creation_failed"); break; }
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "answer", sdp: answer, fromUserId: user.id, targetUserId: payload.fromUserId, signalId: `answer-${Date.now()}` },
            });
            logger.log("answer_sent", { to: payload.fromUserId });
            clearRingTimeout();
            if (callStateRef.current !== "active") {
              setCallStateTracked("active");
              startHeartbeat(channel, user.id);
            }
          } catch (e: any) {
            logger.log("offer_handling_error", { error: e?.message });
          }
          break;
        }

        // ── ANSWER: caller applies answer ──
        case "answer": {
          if (callRoleRef.current !== "caller") break;
          await webrtc.handleAnswer(payload.fromUserId, payload.sdp);
          logger.log("answer_applied");
          clearRingTimeout();
          if (callStateRef.current !== "active") {
            setCallStateTracked("active");
            startHeartbeat(channel, user.id);
          }
          break;
        }

        case "ice-candidate": {
          await webrtc.handleIceCandidate(payload.fromUserId, payload.candidate);
          break;
        }

        case "end-call": {
          logger.log("remote_end_call", { from: payload.fromUserId });
          toast.info("Звонок завершён");
          cleanupCall();
          break;
        }

        case "reject": {
          logger.log("remote_reject", { from: payload.fromUserId });
          toast.info("Звонок отклонён");
          cleanupCall();
          break;
        }
      }
    });

    return new Promise<ReturnType<typeof supabase.channel>>((resolve) => {
      channel.subscribe((status) => {
        logger.log("channel_status", { status, convId });
        if (status === "SUBSCRIBED") { channelRef.current = channel; resolve(channel); }
      });
    });
  }, [user, webrtc, cleanupCall, clearRingTimeout, logger, makeIceSender, handleConnectionLost, setCallStateTracked, startHeartbeat]);

  // ── Incoming call listener ──
  useEffect(() => {
    if (!user || !membership) return;

    const incomingChannel = supabase.channel(`incoming-calls-${user.id}`, { config: { broadcast: { self: false } } });

    incomingChannel.on("broadcast", { event: "incoming-call" }, async ({ payload }) => {
      if (callStateRef.current !== "idle") {
        // Auto-reject if busy
        const ch = supabase.channel(`call-${payload.conversationId}`, { config: { broadcast: { self: false } } });
        ch.subscribe((s) => {
          if (s === "SUBSCRIBED") {
            ch.send({ type: "broadcast", event: "call-signal", payload: { type: "reject", fromUserId: user.id, targetUserId: payload.callerId } });
            setTimeout(() => supabase.removeChannel(ch), 1000);
          }
        });
        return;
      }

      logger.initSession(user.id, membership.company_id);
      logger.log("incoming_call", { callerId: payload.callerId, callType: payload.callType, conversationId: payload.conversationId });

      callRoleRef.current = "callee";
      offerSentRef.current = false;
      setCallStateTracked("incoming");
      setCallType(payload.callType);
      setIsGroupCall(payload.isGroup);
      setConversationId(payload.conversationId);
      setCaller({ userId: payload.callerId, name: payload.callerName, avatarUrl: payload.callerAvatar });
      setParticipants(payload.participants || []);

      // Browser notification when tab is in background
      if (document.hidden && "Notification" in window && Notification.permission === "granted") {
        const callLabel = payload.callType === "video" ? "Видеозвонок" : "Аудиозвонок";
        const notification = new Notification(`${callLabel} от ${payload.callerName}`, {
          body: "Нажмите, чтобы ответить",
          icon: payload.callerAvatar || undefined,
          tag: "incoming-call",
          requireInteraction: true,
        });
        notification.onclick = () => {
          window.focus();
          notification.close();
        };
        // Auto-close after ring timeout
        setTimeout(() => notification.close(), 30000);
      } else if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }

      await setupSignalingChannel(payload.conversationId);

      ringTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current === "incoming") {
          logger.log("ring_timeout");
          cleanupCall();
          toast.info("Пропущенный звонок");
        }
      }, 30000);
    });

    incomingChannel.subscribe();
    return () => { supabase.removeChannel(incomingChannel); };
  }, [user, membership, setupSignalingChannel, cleanupCall, logger, setCallStateTracked]);

  // ── Start call (CALLER) ──
  const startCall = useCallback(async (convId: string, type: CallType, targetUsers: CallParticipant[], isGroup: boolean) => {
    if (!user || !membership) return;

    const sessionId = logger.initSession(user.id, membership.company_id);
    logger.log("start_call", { conversationId: convId, callType: type, sessionId });

    try {
      await webrtc.getMedia(type === "video");
    } catch (err: any) {
      toast.error(err.message === "no_permission" ? "Нет доступа к микрофону/камере" : "Ошибка доступа к медиа");
      return;
    }

    callRoleRef.current = "caller";
    offerSentRef.current = false;
    setCallStateTracked("outgoing");
    setCallType(type);
    setIsGroupCall(isGroup);
    setConversationId(convId);
    setParticipants(targetUsers);

    const { data: log } = await supabase.from("call_logs").insert({
      conversation_id: convId, caller_id: user.id, call_type: type, status: "missed", company_id: membership.company_id,
    }).select("id").single();
    if (log) setCallLogId(log.id);

    await setupSignalingChannel(convId);

    const { data: profile } = await supabase.from("profiles").select("first_name, last_name, avatar_url").eq("user_id", user.id).maybeSingle();
    const callerName = profile ? `${profile.first_name} ${profile.last_name}` : "Unknown";
    const callerAvatar = profile?.avatar_url || null;

    for (const target of targetUsers) {
      const ch = supabase.channel(`incoming-calls-${target.userId}`, { config: { broadcast: { self: false } } });
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          ch.send({
            type: "broadcast", event: "incoming-call",
            payload: {
              conversationId: convId, callType: type, isGroup,
              callerId: user.id, callerName, callerAvatar,
              participants: [{ userId: user.id, name: callerName, avatarUrl: callerAvatar }, ...targetUsers],
            },
          });
          setTimeout(() => supabase.removeChannel(ch), 2000);
        }
      });
    }

    ringTimeoutRef.current = setTimeout(() => {
      if (callStateRef.current !== "outgoing") return;
      logger.log("ring_timeout_outgoing");
      toast.info("Нет ответа");
      cleanupCall();
    }, 30000);
  }, [user, membership, webrtc, setupSignalingChannel, cleanupCall, logger, setCallStateTracked]);

  // ── Accept call (CALLEE) ──
  const acceptCall = useCallback(async () => {
    if (!user || !conversationId || !caller) return;

    logger.log("accept_call", { callType, callerId: caller.userId });

    try {
      await webrtc.getMedia(callType === "video");
    } catch (err: any) {
      toast.error(err.message === "no_permission" ? "Нет доступа к микрофону/камере" : "Ошибка доступа к медиа");
      return;
    }

    clearRingTimeout();
    const channel = channelRef.current;
    if (!channel) { logger.log("accept_no_channel"); return; }

    // Send accept → caller will create offer
    channel.send({
      type: "broadcast", event: "call-signal",
      payload: { type: "accept", fromUserId: user.id, targetUserId: caller.userId, signalId: `accept-${Date.now()}` },
    });
    logger.log("accept_sent", { callerId: caller.userId });
  }, [user, conversationId, caller, callType, webrtc, clearRingTimeout, logger]);

  // ── Reject call ──
  const rejectCall = useCallback(() => {
    logger.log("reject_call");
    if (!user || !caller || !channelRef.current) { cleanupCall(); return; }
    channelRef.current.send({
      type: "broadcast", event: "call-signal",
      payload: { type: "reject", fromUserId: user.id, targetUserId: caller.userId },
    });
    cleanupCall();
  }, [user, caller, cleanupCall, logger]);

  // ── End call (graceful) ──
  const endCall = useCallback(async () => {
    logger.log("end_call", { duration: callDuration });
    if (!user) { cleanupCall(); return; }

    // Notify all participants
    if (channelRef.current) {
      const targets = caller ? [caller, ...participants] : participants;
      for (const p of targets) {
        if (p.userId !== user.id) {
          channelRef.current.send({
            type: "broadcast", event: "call-signal",
            payload: { type: "end-call", fromUserId: user.id, targetUserId: p.userId },
          });
        }
      }
    }

    // Update call log
    if (callLogId) {
      await supabase.from("call_logs").update({
        status: "completed", ended_at: new Date().toISOString(), duration_seconds: callDuration,
      }).eq("id", callLogId);
    }

    cleanupCall();
  }, [user, caller, participants, callLogId, callDuration, cleanupCall, logger]);

  return (
    <CallContext.Provider value={{
      callState, callType, isGroupCall, participants, caller, conversationId, callDuration,
      localStream: webrtc.localStream, remoteStreams: webrtc.remoteStreams,
      isMuted: webrtc.isMuted, isCameraOff: webrtc.isCameraOff,
      startCall, acceptCall, rejectCall, endCall,
      toggleMute: webrtc.toggleMute, toggleCamera: webrtc.toggleCamera,
    }}>
      {children}
    </CallContext.Provider>
  );
};

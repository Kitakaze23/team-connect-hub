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
  
  // Dedup: track processed signal IDs
  const processedSignalsRef = useRef<Set<string>>(new Set());
  // Role in current call: "caller" or "callee"
  const callRoleRef = useRef<"caller" | "callee" | null>(null);

  // Wire logger into WebRTC
  useEffect(() => {
    webrtc.setLogger(logger.log);
  }, [webrtc.setLogger, logger.log]);

  const setCallStateTracked = useCallback((s: CallState) => {
    logger.log("state_change", { from: callStateRef.current, to: s });
    callStateRef.current = s;
    setCallState(s);
  }, [logger]);

  const clearRingTimeout = useCallback(() => {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (callState === "active") {
      setCallDuration(0);
      timerRef.current = setInterval(() => setCallDuration(d => d + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callState]);

  const cleanupCall = useCallback(() => {
    logger.log("cleanup_call");
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    clearRingTimeout();
    webrtc.cleanup();
    setCallStateTracked("idle");
    setParticipants([]);
    setCaller(null);
    setConversationId(null);
    setCallDuration(0);
    setCallLogId(null);
    callRoleRef.current = null;
    processedSignalsRef.current.clear();
    logger.reset();
  }, [webrtc, clearRingTimeout, logger, setCallStateTracked]);

  const makeIceSender = useCallback((channel: ReturnType<typeof supabase.channel>, fromUserId: string, targetUserId: string) => {
    return (candidate: RTCIceCandidate) => {
      channel.send({
        type: "broadcast", event: "call-signal",
        payload: {
          type: "ice-candidate",
          candidate: candidate.toJSON(),
          fromUserId,
          targetUserId,
          signalId: `ice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        },
      });
    };
  }, []);

  const handleConnectionLost = useCallback(() => {
    if (callStateRef.current === "active") {
      logger.log("connection_lost_ending_call");
      toast.error("Соединение потеряно");
      cleanupCall();
    }
  }, [cleanupCall, logger]);

  const setupSignalingChannel = useCallback((convId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel(`call-${convId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
      if (!user || payload.targetUserId !== user.id) return;

      // Dedup: skip already processed signals (except ICE which can be many)
      const signalId = payload.signalId;
      if (signalId && payload.type !== "ice-candidate") {
        if (processedSignalsRef.current.has(signalId)) {
          logger.log("signal_deduped", { type: payload.type, signalId });
          return;
        }
        processedSignalsRef.current.add(signalId);
      }

      logger.log("signal_received", { type: payload.type, from: payload.fromUserId, role: callRoleRef.current });

      switch (payload.type) {
        case "offer": {
          // Only the CALLER should receive offers (from callee who accepted)
          // In our flow: callee accepts → callee sends "accept" → caller creates offer → callee receives offer
          // OR in the current flow: callee accepts → creates offer → sends to caller
          try {
            const answer = await webrtc.handleOffer(
              payload.fromUserId,
              payload.sdp,
              makeIceSender(channel, user.id, payload.fromUserId),
              handleConnectionLost,
            );
            if (!answer) {
              logger.log("offer_handling_returned_null", { from: payload.fromUserId });
              break;
            }
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: {
                type: "answer",
                sdp: answer,
                fromUserId: user.id,
                targetUserId: payload.fromUserId,
                signalId: `answer-${Date.now()}`,
              },
            });
            logger.log("answer_sent", { to: payload.fromUserId });
            clearRingTimeout();
            if (callStateRef.current !== "active") {
              setCallStateTracked("active");
            }
          } catch (e: any) {
            logger.log("offer_error", { error: e?.message || String(e) });
          }
          break;
        }
        case "answer": {
          await webrtc.handleAnswer(payload.fromUserId, payload.sdp);
          logger.log("answer_applied");
          clearRingTimeout();
          if (callStateRef.current !== "active") {
            setCallStateTracked("active");
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
        logger.log("signaling_channel_status", { status, convId });
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          resolve(channel);
        }
      });
    });
  }, [user, webrtc, cleanupCall, clearRingTimeout, logger, makeIceSender, handleConnectionLost, setCallStateTracked]);

  // Listen for incoming calls
  useEffect(() => {
    if (!user || !membership) return;

    const incomingChannel = supabase.channel(`incoming-calls-${user.id}`, {
      config: { broadcast: { self: false } },
    });

    incomingChannel.on("broadcast", { event: "incoming-call" }, async ({ payload }) => {
      if (callStateRef.current !== "idle") {
        logger.log("auto_reject_busy", { callerId: payload.callerId });
        const rejectChannel = supabase.channel(`call-${payload.conversationId}`, { config: { broadcast: { self: false } } });
        rejectChannel.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            rejectChannel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "reject", fromUserId: user.id, targetUserId: payload.callerId },
            });
            setTimeout(() => supabase.removeChannel(rejectChannel), 1000);
          }
        });
        return;
      }

      logger.initSession(user.id, membership.company_id);
      logger.log("incoming_call_received", {
        callerId: payload.callerId,
        callType: payload.callType,
        conversationId: payload.conversationId,
      });

      callRoleRef.current = "callee";
      setCallStateTracked("incoming");
      setCallType(payload.callType);
      setIsGroupCall(payload.isGroup);
      setConversationId(payload.conversationId);
      setCaller({ userId: payload.callerId, name: payload.callerName, avatarUrl: payload.callerAvatar });
      setParticipants(payload.participants || []);

      await setupSignalingChannel(payload.conversationId);

      ringTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current === "incoming") {
          logger.log("ring_timeout_incoming");
          cleanupCall();
          toast.info("Пропущенный звонок");
        }
      }, 30000);
    });

    incomingChannel.subscribe();
    return () => { supabase.removeChannel(incomingChannel); };
  }, [user, membership, setupSignalingChannel, cleanupCall, logger, setCallStateTracked]);

  const startCall = useCallback(async (convId: string, type: CallType, targetUsers: CallParticipant[], isGroup: boolean) => {
    if (!user || !membership) return;

    const sessionId = logger.initSession(user.id, membership.company_id);
    logger.log("start_call_initiated", { conversationId: convId, callType: type, sessionId });

    try {
      await webrtc.getMedia(type === "video");
      logger.log("media_acquired_caller", { type });
    } catch (err: any) {
      logger.log("media_error_caller", { error: err.message });
      toast.error(err.message === "no_permission" ? "Нет доступа к микрофону/камере" : "Ошибка доступа к медиа");
      return;
    }

    callRoleRef.current = "caller";
    setCallStateTracked("outgoing");
    setCallType(type);
    setIsGroupCall(isGroup);
    setConversationId(convId);
    setParticipants(targetUsers);

    const { data: log } = await supabase.from("call_logs").insert({
      conversation_id: convId,
      caller_id: user.id,
      call_type: type,
      status: "missed",
      company_id: membership.company_id,
    }).select("id").single();
    if (log) setCallLogId(log.id);

    await setupSignalingChannel(convId);

    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const callerName = profile ? `${profile.first_name} ${profile.last_name}` : "Unknown";
    const callerAvatar = profile?.avatar_url || null;

    for (const target of targetUsers) {
      const userChannel = supabase.channel(`incoming-calls-${target.userId}`, { config: { broadcast: { self: false } } });
      userChannel.subscribe((status) => {
        if (status === "SUBSCRIBED") {
          userChannel.send({
            type: "broadcast", event: "incoming-call",
            payload: {
              conversationId: convId, callType: type, isGroup,
              callerId: user.id, callerName, callerAvatar,
              participants: [{ userId: user.id, name: callerName, avatarUrl: callerAvatar }, ...targetUsers],
            },
          });
          setTimeout(() => supabase.removeChannel(userChannel), 2000);
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

  const acceptCall = useCallback(async () => {
    if (!user || !conversationId || !caller) return;

    logger.log("accept_call", { callType, callerId: caller.userId });

    try {
      await webrtc.getMedia(callType === "video");
      logger.log("media_acquired_callee", { type: callType });
    } catch (err: any) {
      logger.log("media_error_callee", { error: err.message });
      toast.error(err.message === "no_permission" ? "Нет доступа к микрофону/камере" : "Ошибка доступа к медиа");
      return;
    }

    clearRingTimeout();

    const channel = channelRef.current;
    if (!channel) {
      logger.log("accept_call_no_channel");
      return;
    }

    // Callee creates the offer (this is the established flow in the app)
    logger.log("callee_creating_offer", { callerId: caller.userId });
    const offer = await webrtc.createOffer(
      caller.userId,
      makeIceSender(channel, user.id, caller.userId),
      handleConnectionLost,
    );

    if (!offer) {
      logger.log("callee_offer_creation_failed");
      return;
    }

    channel.send({
      type: "broadcast", event: "call-signal",
      payload: {
        type: "offer",
        sdp: offer,
        fromUserId: user.id,
        targetUserId: caller.userId,
        signalId: `offer-${Date.now()}`,
      },
    });
    logger.log("offer_sent_to_caller", { callerId: caller.userId });
  }, [user, conversationId, caller, callType, webrtc, clearRingTimeout, logger, makeIceSender, handleConnectionLost]);

  const rejectCall = useCallback(() => {
    logger.log("reject_call", { callerId: caller?.userId });
    if (!user || !caller || !channelRef.current) { cleanupCall(); return; }
    channelRef.current.send({
      type: "broadcast", event: "call-signal",
      payload: { type: "reject", fromUserId: user.id, targetUserId: caller.userId },
    });
    cleanupCall();
  }, [user, caller, cleanupCall, logger]);

  const endCall = useCallback(async () => {
    logger.log("end_call", { duration: callDuration });
    if (!user) { cleanupCall(); return; }

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

    if (callLogId) {
      await supabase.from("call_logs").update({
        status: "completed",
        ended_at: new Date().toISOString(),
        duration_seconds: callDuration,
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

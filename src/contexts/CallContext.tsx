import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useWebRTC } from "@/hooks/useWebRTC";
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
  // WebRTC
  localStream: MediaStream | null;
  remoteStreams: Map<string, MediaStream>;
  isMuted: boolean;
  isCameraOff: boolean;
  // Actions
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

  const [callState, setCallState] = useState<CallState>("idle");
  const callStateRef = useRef<CallState>("idle");
  const setCallStateTracked = (s: CallState) => { callStateRef.current = s; setCallState(s); };
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

  // Timer for active call
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
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
    webrtc.cleanup();
    setCallStateTracked("idle");
    setParticipants([]);
    setCaller(null);
    setConversationId(null);
    setCallDuration(0);
    setCallLogId(null);
  }, [webrtc]);

  const setupSignalingChannel = useCallback((convId: string) => {
    const channel = supabase.channel(`call-${convId}`, {
      config: { broadcast: { self: false } },
    });

    channel.on("broadcast", { event: "call-signal" }, async ({ payload }) => {
      if (!user || payload.targetUserId !== user.id) return;

      switch (payload.type) {
        case "offer":
          try {
            const answer = await webrtc.handleOffer(payload.fromUserId, payload.sdp, (candidate) => {
              channel.send({
                type: "broadcast", event: "call-signal",
                payload: { type: "ice-candidate", candidate: candidate.toJSON(), fromUserId: user.id, targetUserId: payload.fromUserId },
              });
            });
            channel.send({
              type: "broadcast", event: "call-signal",
              payload: { type: "answer", sdp: answer, fromUserId: user.id, targetUserId: payload.fromUserId },
            });
            setCallStateTracked("active");
          } catch (e) {
            console.error("Error handling offer:", e);
          }
          break;
        case "answer":
          await webrtc.handleAnswer(payload.fromUserId, payload.sdp);
          setCallStateTracked("active");
          break;
        case "ice-candidate":
          await webrtc.handleIceCandidate(payload.fromUserId, payload.candidate);
          break;
        case "end-call":
          toast.info("Звонок завершён");
          cleanupCall();
          break;
        case "reject":
          toast.info("Звонок отклонён");
          cleanupCall();
          break;
      }
    });

    channel.subscribe();
    channelRef.current = channel;
    return channel;
  }, [user, webrtc, cleanupCall]);

  // Listen for incoming calls
  useEffect(() => {
    if (!user || !membership) return;

    const incomingChannel = supabase.channel(`incoming-calls-${user.id}`, {
      config: { broadcast: { self: false } },
    });

    incomingChannel.on("broadcast", { event: "incoming-call" }, ({ payload }) => {
      if (callStateRef.current !== "idle") {
        // Already in a call, auto-reject
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

      setCallStateTracked("incoming");
      setCallType(payload.callType);
      setIsGroupCall(payload.isGroup);
      setConversationId(payload.conversationId);
      setCaller({ userId: payload.callerId, name: payload.callerName, avatarUrl: payload.callerAvatar });
      setParticipants(payload.participants || []);

      // Setup signaling
      setupSignalingChannel(payload.conversationId);

      // Auto-reject after 30s
      ringTimeoutRef.current = setTimeout(() => {
        if (callStateRef.current === "incoming") {
          cleanupCall();
          toast.info("Пропущенный звонок");
        }
      }, 30000);
    });

    incomingChannel.subscribe();
    return () => { supabase.removeChannel(incomingChannel); };
  }, [user, membership, setupSignalingChannel, cleanupCall]);

  const startCall = useCallback(async (convId: string, type: CallType, targetUsers: CallParticipant[], isGroup: boolean) => {
    if (!user || !membership) return;
    
    try {
      await webrtc.getMedia(type === "video");
    } catch (err: any) {
      toast.error(err.message === "no_permission" ? "Нет доступа к микрофону/камере" : "Ошибка доступа к медиа");
      return;
    }

    setCallStateTracked("outgoing");
    setCallType(type);
    setIsGroupCall(isGroup);
    setConversationId(convId);
    setParticipants(targetUsers);

    // Create call log
    const { data: log } = await supabase.from("call_logs").insert({
      conversation_id: convId,
      caller_id: user.id,
      call_type: type,
      status: "missed",
      company_id: membership.company_id,
    }).select("id").single();
    if (log) setCallLogId(log.id);

    // Setup signaling channel
    const channel = setupSignalingChannel(convId);

    // Get user profile for caller info
    const { data: profile } = await supabase
      .from("profiles")
      .select("first_name, last_name, avatar_url")
      .eq("user_id", user.id)
      .maybeSingle();

    const callerName = profile ? `${profile.first_name} ${profile.last_name}` : "Unknown";
    const callerAvatar = profile?.avatar_url || null;

    // Send incoming call signal to each target user
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

    // Auto-cancel after 30s
    ringTimeoutRef.current = setTimeout(() => {
      toast.info("Нет ответа");
      cleanupCall();
    }, 30000);
  }, [user, membership, webrtc, setupSignalingChannel, cleanupCall]);

  const acceptCall = useCallback(async () => {
    if (!user || !conversationId || !caller) return;

    try {
      await webrtc.getMedia(callType === "video");
    } catch (err: any) {
      toast.error(err.message === "no_permission" ? "Нет доступа к микрофону/камере" : "Ошибка доступа к медиа");
      return;
    }

    if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);

    // Create offer and send
    const channel = channelRef.current;
    if (!channel) return;

    const offer = await webrtc.createOffer(caller.userId, (candidate) => {
      channel.send({
        type: "broadcast", event: "call-signal",
        payload: { type: "ice-candidate", candidate: candidate.toJSON(), fromUserId: user.id, targetUserId: caller.userId },
      });
    });

    channel.send({
      type: "broadcast", event: "call-signal",
      payload: { type: "offer", sdp: offer, fromUserId: user.id, targetUserId: caller.userId },
    });
  }, [user, conversationId, caller, callType, webrtc]);

  const rejectCall = useCallback(() => {
    if (!user || !caller || !channelRef.current) { cleanupCall(); return; }
    channelRef.current.send({
      type: "broadcast", event: "call-signal",
      payload: { type: "reject", fromUserId: user.id, targetUserId: caller.userId },
    });
    cleanupCall();
  }, [user, caller, cleanupCall]);

  const endCall = useCallback(async () => {
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
        status: "completed",
        ended_at: new Date().toISOString(),
        duration_seconds: callDuration,
      }).eq("id", callLogId);
    }

    cleanupCall();
  }, [user, caller, participants, callLogId, callDuration, cleanupCall]);

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

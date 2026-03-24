import { useCallback, useRef, useState, useEffect } from "react";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    // Metered OpenRelay TURN (UDP, TCP, TLS)
    {
      urls: "turn:a.relay.metered.ca:80",
      username: "e8dd65a92f3aad1a0cca8cb6",
      credential: "gEn0smmGOSaoRH0B",
    },
    {
      urls: "turn:a.relay.metered.ca:80?transport=tcp",
      username: "e8dd65a92f3aad1a0cca8cb6",
      credential: "gEn0smmGOSaoRH0B",
    },
    {
      urls: "turn:a.relay.metered.ca:443",
      username: "e8dd65a92f3aad1a0cca8cb6",
      credential: "gEn0smmGOSaoRH0B",
    },
    {
      urls: "turns:a.relay.metered.ca:443?transport=tcp",
      username: "e8dd65a92f3aad1a0cca8cb6",
      credential: "gEn0smmGOSaoRH0B",
    },
    // Backup: OpenRelay free TURN
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turns:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 2,
};

export interface Participant {
  userId: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  name: string;
  avatarUrl: string | null;
}

type LogFn = (event: string, details?: Record<string, any>) => void;
type IceRestartRequestFn = (remoteUserId: string) => void;

export const useWebRTC = () => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");
  
  const negotiationInProgressRef = useRef<Set<string>>(new Set());
  const loggerRef = useRef<LogFn>(() => {});
  // Track ICE restart attempts per peer to limit retries
  const iceRestartCountRef = useRef<Map<string, number>>(new Map());
  // Callback for ICE restart renegotiation (set by CallContext)
  const iceRestartRequestRef = useRef<IceRestartRequestFn | null>(null);

  const setLogger = useCallback((fn: LogFn) => {
    loggerRef.current = fn;
  }, []);

  const setIceRestartHandler = useCallback((fn: IceRestartRequestFn) => {
    iceRestartRequestRef.current = fn;
  }, []);

  const log = useCallback((event: string, details?: Record<string, any>) => {
    console.log(`[WebRTC] ${event}`, details || "");
    loggerRef.current(event, details);
  }, []);

  const getMedia = useCallback(async (video: boolean) => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      const hasAudio = tracks.some(t => t.kind === "audio" && t.readyState === "live");
      const hasVideo = !video || tracks.some(t => t.kind === "video" && t.readyState === "live");
      if (hasAudio && hasVideo) {
        log("media_reused");
        return localStreamRef.current;
      }
      tracks.forEach(t => t.stop());
    }

    try {
      log("media_requesting", { audio: true, video });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      log("media_acquired", { tracks: stream.getTracks().map(t => `${t.kind}:${t.readyState}`) });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err: any) {
      log("media_error", { name: err.name, message: err.message });
      throw new Error(err.name === "NotAllowedError" ? "no_permission" : "media_error");
    }
  }, [log]);

  const flushPendingCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteUserId);
    if (!pending || pending.length === 0) return;
    log("flushing_ice_candidates", { count: pending.length, remoteUserId });
    for (const candidate of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        log("flush_ice_error", { error: String(e) });
      }
    }
    pendingCandidatesRef.current.delete(remoteUserId);
  }, [log]);

  const getOrCreatePC = useCallback((
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing && existing.signalingState !== "closed") {
      log("pc_reused", { remoteUserId, signalingState: existing.signalingState });
      return existing;
    }

    log("pc_creating", { remoteUserId, iceServersCount: ICE_SERVERS.iceServers?.length });
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // Log candidate type for debugging (host/srflx/relay)
        const candidateStr = event.candidate.candidate;
        const typeMatch = candidateStr.match(/typ (\w+)/);
        const candidateType = typeMatch ? typeMatch[1] : "unknown";
        log("ice_candidate_generated", { 
          remoteUserId, 
          type: candidateType,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          candidate: candidateStr.substring(0, 80),
        });
        onIceCandidate(event.candidate);
      } else {
        log("ice_gathering_complete", { remoteUserId });
      }
    };

    pc.onicegatheringstatechange = () => {
      log("ice_gathering_state", { remoteUserId, state: pc.iceGatheringState });
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log("ice_connection_state", { remoteUserId, state });
      
      if (state === "connected" || state === "completed") {
        // Reset restart counter on success
        iceRestartCountRef.current.set(remoteUserId, 0);
        log("ice_connected_success", { remoteUserId });
      }

      if (state === "failed") {
        const restartCount = iceRestartCountRef.current.get(remoteUserId) || 0;
        if (restartCount < 3) {
          iceRestartCountRef.current.set(remoteUserId, restartCount + 1);
          log("ice_restart_attempt", { remoteUserId, attempt: restartCount + 1 });
          // restartIce() marks the PC as needing renegotiation
          pc.restartIce();
          // Request the caller to create a new offer for ICE restart
          if (iceRestartRequestRef.current) {
            iceRestartRequestRef.current(remoteUserId);
          }
        } else {
          log("ice_restart_exhausted", { remoteUserId, attempts: restartCount });
          onDisconnected?.();
        }
      }

      if (state === "disconnected") {
        // Wait before declaring lost — ICE can recover
        setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            log("ice_disconnected_timeout", { remoteUserId, currentState: pc.iceConnectionState });
            // Try restart before giving up
            const restartCount = iceRestartCountRef.current.get(remoteUserId) || 0;
            if (restartCount < 3) {
              iceRestartCountRef.current.set(remoteUserId, restartCount + 1);
              pc.restartIce();
              if (iceRestartRequestRef.current) {
                iceRestartRequestRef.current(remoteUserId);
              }
            } else {
              onDisconnected?.();
            }
          }
        }, 8000);
      }
    };

    pc.onsignalingstatechange = () => {
      log("signaling_state", { remoteUserId, state: pc.signalingState });
    };

    pc.ontrack = (event) => {
      log("remote_track_received", { remoteUserId, kind: event.track.kind, readyState: event.track.readyState });
      const stream = event.streams[0];
      if (stream) {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(remoteUserId, stream);
          return next;
        });
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      log("connection_state", { remoteUserId, state });
      setConnectionState(state);
      
      // Don't immediately disconnect on "failed" — let ICE restart handler above deal with it
      // Only disconnect if connection truly fails after retries (handled in oniceconnectionstatechange)
    };

    // Add local tracks
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      log("adding_local_tracks", { count: tracks.length, kinds: tracks.map(t => t.kind) });
      tracks.forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      log("no_local_stream_warning", { remoteUserId });
    }

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [log]);

  const createOffer = useCallback(async (
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
    iceRestart?: boolean,
  ) => {
    // Guard: prevent duplicate offer creation (but allow ICE restart)
    if (!iceRestart && negotiationInProgressRef.current.has(remoteUserId)) {
      log("offer_skipped_negotiation_in_progress", { remoteUserId });
      return null;
    }
    negotiationInProgressRef.current.add(remoteUserId);

    const pc = getOrCreatePC(remoteUserId, onIceCandidate, onDisconnected);
    
    // For ICE restart, we need stable or have-local-offer state
    if (!iceRestart && pc.signalingState !== "stable") {
      log("offer_skipped_signaling_not_stable", { remoteUserId, state: pc.signalingState });
      negotiationInProgressRef.current.delete(remoteUserId);
      return null;
    }

    try {
      log("creating_offer", { remoteUserId, iceRestart: !!iceRestart });
      const offer = await pc.createOffer({ iceRestart: !!iceRestart });
      
      await pc.setLocalDescription(offer);
      log("offer_created_and_set", { remoteUserId, iceRestart: !!iceRestart });
      return offer;
    } catch (e: any) {
      log("create_offer_error", { remoteUserId, error: e.message });
      negotiationInProgressRef.current.delete(remoteUserId);
      return null;
    }
  }, [getOrCreatePC, log]);

  const handleOffer = useCallback(async (
    remoteUserId: string,
    offer: RTCSessionDescriptionInit,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ) => {
    const pc = getOrCreatePC(remoteUserId, onIceCandidate, onDisconnected);

    // Handle glare: if we're in have-local-offer state, we have a collision
    if (pc.signalingState === "have-local-offer") {
      log("glare_detected_rollback", { remoteUserId });
      await pc.setLocalDescription({ type: "rollback" });
    }

    if (pc.signalingState !== "stable") {
      log("offer_rejected_bad_state", { remoteUserId, state: pc.signalingState });
      return null;
    }

    try {
      log("setting_remote_offer", { remoteUserId });
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      log("remote_offer_set", { remoteUserId });
      
      await flushPendingCandidates(remoteUserId, pc);
      
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("answer_created_and_set", { remoteUserId });
      
      negotiationInProgressRef.current.delete(remoteUserId);
      return answer;
    } catch (e: any) {
      log("handle_offer_error", { remoteUserId, error: e.message });
      return null;
    }
  }, [getOrCreatePC, flushPendingCandidates, log]);

  const handleAnswer = useCallback(async (remoteUserId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (!pc) {
      log("answer_ignored_no_pc", { remoteUserId });
      return;
    }

    if (pc.signalingState !== "have-local-offer") {
      log("answer_ignored_bad_state", { remoteUserId, state: pc.signalingState });
      return;
    }

    try {
      log("setting_remote_answer", { remoteUserId });
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      log("remote_answer_set", { remoteUserId });
      await flushPendingCandidates(remoteUserId, pc);
      negotiationInProgressRef.current.delete(remoteUserId);
    } catch (e: any) {
      log("handle_answer_error", { remoteUserId, error: e.message });
    }
  }, [flushPendingCandidates, log]);

  const handleIceCandidate = useCallback(async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc && pc.remoteDescription && pc.remoteDescription.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        log("add_ice_error", { remoteUserId, error: String(e) });
      }
    } else {
      if (!pendingCandidatesRef.current.has(remoteUserId)) {
        pendingCandidatesRef.current.set(remoteUserId, []);
      }
      pendingCandidatesRef.current.get(remoteUserId)!.push(candidate);
      log("ice_candidate_queued", { remoteUserId, queueSize: pendingCandidatesRef.current.get(remoteUserId)!.length });
    }
  }, [log]);

  const toggleMute = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsMuted(prev => !prev);
    }
  }, []);

  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      localStreamRef.current.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
      setIsCameraOff(prev => !prev);
    }
  }, []);

  const cleanup = useCallback(() => {
    log("cleanup");
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    negotiationInProgressRef.current.clear();
    iceRestartCountRef.current.clear();
    setRemoteStreams(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
    setConnectionState("new");
  }, [log]);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    localStream, remoteStreams, isMuted, isCameraOff, connectionState,
    getMedia, createOffer, handleOffer, handleAnswer, handleIceCandidate,
    toggleMute, toggleCamera, cleanup, setLogger, setIceRestartHandler,
  };
};

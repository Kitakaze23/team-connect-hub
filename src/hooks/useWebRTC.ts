import { useCallback, useRef, useState, useEffect } from "react";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
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
  ],
  iceCandidatePoolSize: 1,
};

const MAX_ICE_RESTARTS = 3;
const DISCONNECT_GRACE_MS = 10_000;

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

  // Single negotiation lock per peer — prevents duplicate offers
  const negotiationLockRef = useRef<Map<string, boolean>>(new Map());
  const loggerRef = useRef<LogFn>(() => {});
  const iceRestartCountRef = useRef<Map<string, number>>(new Map());
  const iceRestartRequestRef = useRef<IceRestartRequestFn | null>(null);
  const disconnectTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  const setLogger = useCallback((fn: LogFn) => { loggerRef.current = fn; }, []);
  const setIceRestartHandler = useCallback((fn: IceRestartRequestFn) => { iceRestartRequestRef.current = fn; }, []);

  const log = useCallback((event: string, details?: Record<string, any>) => {
    loggerRef.current(event, details);
  }, []);

  // ── Media ──────────────────────────────────────────────
  const getMedia = useCallback(async (video: boolean) => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      const hasAudio = tracks.some(t => t.kind === "audio" && t.readyState === "live");
      const hasVideo = !video || tracks.some(t => t.kind === "video" && t.readyState === "live");
      if (hasAudio && hasVideo) return localStreamRef.current;
      tracks.forEach(t => t.stop());
    }
    try {
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

  // ── ICE candidate queue flush ──────────────────────────
  const flushPendingCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteUserId);
    if (!pending?.length) return;
    log("flush_ice_candidates", { count: pending.length, remoteUserId });
    for (const c of pending) {
      try { await pc.addIceCandidate(new RTCIceCandidate(c)); } catch {}
    }
    pendingCandidatesRef.current.delete(remoteUserId);
  }, [log]);

  // ── Clear disconnect timer ─────────────────────────────
  const clearDisconnectTimer = useCallback((remoteUserId: string) => {
    const timer = disconnectTimersRef.current.get(remoteUserId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimersRef.current.delete(remoteUserId);
    }
  }, []);

  // ── PeerConnection factory ─────────────────────────────
  const getOrCreatePC = useCallback((
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing && existing.signalingState !== "closed") return existing;

    log("pc_create", { remoteUserId });
    const pc = new RTCPeerConnection(ICE_SERVERS);

    // ── ICE candidates ──
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onIceCandidate(event.candidate);
      }
    };

    // ── ICE connection state ──
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log("ice_state", { remoteUserId, state });

      if (state === "connected" || state === "completed") {
        iceRestartCountRef.current.set(remoteUserId, 0);
        clearDisconnectTimer(remoteUserId);
      }

      if (state === "failed") {
        clearDisconnectTimer(remoteUserId);
        const count = (iceRestartCountRef.current.get(remoteUserId) || 0) + 1;
        iceRestartCountRef.current.set(remoteUserId, count);
        if (count <= MAX_ICE_RESTARTS) {
          log("ice_restart", { remoteUserId, attempt: count });
          pc.restartIce();
          iceRestartRequestRef.current?.(remoteUserId);
        } else {
          log("ice_restart_exhausted", { remoteUserId });
          onDisconnected?.();
        }
      }

      if (state === "disconnected") {
        clearDisconnectTimer(remoteUserId);
        const timer = setTimeout(() => {
          const s = pc.iceConnectionState;
          if (s === "disconnected" || s === "failed") {
            const count = (iceRestartCountRef.current.get(remoteUserId) || 0) + 1;
            iceRestartCountRef.current.set(remoteUserId, count);
            if (count <= MAX_ICE_RESTARTS) {
              pc.restartIce();
              iceRestartRequestRef.current?.(remoteUserId);
            } else {
              onDisconnected?.();
            }
          }
        }, DISCONNECT_GRACE_MS);
        disconnectTimersRef.current.set(remoteUserId, timer);
      }
    };

    // ── Connection state ──
    pc.onconnectionstatechange = () => {
      log("conn_state", { remoteUserId, state: pc.connectionState });
    };

    // ── Signaling state ──
    pc.onsignalingstatechange = () => {
      log("sig_state", { remoteUserId, state: pc.signalingState });
      // Release negotiation lock when stable
      if (pc.signalingState === "stable") {
        negotiationLockRef.current.delete(remoteUserId);
      }
    };

    // ── Suppress automatic onnegotiationneeded ──
    // We manage negotiation explicitly — never let the browser auto-trigger offers
    pc.onnegotiationneeded = () => {
      log("negotiation_needed_suppressed", { remoteUserId, signalingState: pc.signalingState });
    };

    // ── Remote tracks ──
    pc.ontrack = (event) => {
      log("remote_track", { remoteUserId, kind: event.track.kind });
      const stream = event.streams[0];
      if (stream) {
        setRemoteStreams(prev => {
          const next = new Map(prev);
          next.set(remoteUserId, stream);
          return next;
        });
      }
    };

    // ── Add local tracks ──
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [log, clearDisconnectTimer]);

  // ── Create Offer (CALLER ONLY) ─────────────────────────
  const createOffer = useCallback(async (
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
    iceRestart?: boolean,
  ) => {
    // Negotiation lock — only one offer at a time per peer
    if (!iceRestart && negotiationLockRef.current.get(remoteUserId)) {
      log("offer_blocked_locked", { remoteUserId });
      return null;
    }
    negotiationLockRef.current.set(remoteUserId, true);

    const pc = getOrCreatePC(remoteUserId, onIceCandidate, onDisconnected);

    // Guard: for initial offer, signaling must be stable
    if (!iceRestart && pc.signalingState !== "stable") {
      log("offer_blocked_state", { remoteUserId, state: pc.signalingState });
      negotiationLockRef.current.delete(remoteUserId);
      return null;
    }

    try {
      const offer = await pc.createOffer({ iceRestart: !!iceRestart });
      await pc.setLocalDescription(offer);
      log("offer_created", { remoteUserId, iceRestart: !!iceRestart });
      return offer;
    } catch (e: any) {
      log("offer_error", { remoteUserId, error: e.message });
      negotiationLockRef.current.delete(remoteUserId);
      return null;
    }
  }, [getOrCreatePC, log]);

  // ── Handle Offer (CALLEE ONLY) ─────────────────────────
  const handleOffer = useCallback(async (
    remoteUserId: string,
    offer: RTCSessionDescriptionInit,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ) => {
    const pc = getOrCreatePC(remoteUserId, onIceCandidate, onDisconnected);

    // Glare: we already sent an offer — rollback (callee always yields)
    if (pc.signalingState === "have-local-offer") {
      log("glare_rollback", { remoteUserId });
      await pc.setLocalDescription({ type: "rollback" });
    }

    if (pc.signalingState !== "stable") {
      log("offer_rejected_state", { remoteUserId, state: pc.signalingState });
      return null;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(remoteUserId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("answer_created", { remoteUserId });
      return answer;
    } catch (e: any) {
      log("handle_offer_error", { remoteUserId, error: e.message });
      return null;
    }
  }, [getOrCreatePC, flushPendingCandidates, log]);

  // ── Handle Answer (CALLER ONLY) ────────────────────────
  const handleAnswer = useCallback(async (remoteUserId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (!pc) return;
    if (pc.signalingState !== "have-local-offer") {
      log("answer_rejected_state", { remoteUserId, state: pc.signalingState });
      return;
    }
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      log("answer_applied", { remoteUserId });
      await flushPendingCandidates(remoteUserId, pc);
    } catch (e: any) {
      log("answer_error", { remoteUserId, error: e.message });
    }
  }, [flushPendingCandidates, log]);

  // ── Handle ICE Candidate ───────────────────────────────
  const handleIceCandidate = useCallback(async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc?.remoteDescription?.type) {
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch {}
    } else {
      if (!pendingCandidatesRef.current.has(remoteUserId)) {
        pendingCandidatesRef.current.set(remoteUserId, []);
      }
      pendingCandidatesRef.current.get(remoteUserId)!.push(candidate);
    }
  }, []);

  // ── Toggle controls ────────────────────────────────────
  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(prev => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOff(prev => !prev);
  }, []);

  // ── Graceful cleanup ───────────────────────────────────
  const cleanup = useCallback(() => {
    log("cleanup");
    // Stop all local tracks
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Close all peer connections gracefully
    peerConnectionsRef.current.forEach((pc, id) => {
      // Remove event handlers to prevent callbacks during teardown
      pc.onicecandidate = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.close();
    });
    peerConnectionsRef.current.clear();

    // Clear all timers
    disconnectTimersRef.current.forEach(t => clearTimeout(t));
    disconnectTimersRef.current.clear();

    pendingCandidatesRef.current.clear();
    negotiationLockRef.current.clear();
    iceRestartCountRef.current.clear();
    setRemoteStreams(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
  }, [log]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return {
    localStream, remoteStreams, isMuted, isCameraOff,
    getMedia, createOffer, handleOffer, handleAnswer, handleIceCandidate,
    toggleMute, toggleCamera, cleanup, setLogger, setIceRestartHandler,
  };
};

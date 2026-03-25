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
type OfferHandlerFn = (
  remoteUserId: string,
  offer: RTCSessionDescriptionInit,
  meta: { iceRestart: boolean },
) => void;

type NegotiationState = {
  isNegotiating: boolean;
  pending: boolean;
  pendingIceRestart: boolean;
};

const parseCandidateType = (candidateLine?: string) => {
  const match = candidateLine?.match(/\btyp\s([a-z0-9]+)/i);
  return match?.[1] ?? "unknown";
};

const parseCandidateTransport = (candidateLine?: string) => {
  const match = candidateLine?.match(/\b(udp|tcp)\b/i);
  return match?.[1]?.toLowerCase() ?? "unknown";
};

export const useWebRTC = () => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);

  const loggerRef = useRef<LogFn>(() => {});
  const offerHandlerRef = useRef<OfferHandlerFn | null>(null);
  const iceRestartCountRef = useRef<Map<string, number>>(new Map());
  const disconnectTimersRef = useRef<Map<string, NodeJS.Timeout>>(new Map());
  const negotiationStateRef = useRef<Map<string, NegotiationState>>(new Map());
  const applyingRemoteOfferRef = useRef<Set<string>>(new Set());

  const setLogger = useCallback((fn: LogFn) => {
    loggerRef.current = fn;
  }, []);

  const setOfferHandler = useCallback((fn: OfferHandlerFn) => {
    offerHandlerRef.current = fn;
  }, []);

  const log = useCallback((event: string, details?: Record<string, any>) => {
    loggerRef.current(event, details);
  }, []);

  const getNegotiationState = useCallback((remoteUserId: string): NegotiationState => {
    let state = negotiationStateRef.current.get(remoteUserId);
    if (!state) {
      state = { isNegotiating: false, pending: false, pendingIceRestart: false };
      negotiationStateRef.current.set(remoteUserId, state);
    }
    return state;
  }, []);

  const clearDisconnectTimer = useCallback((remoteUserId: string) => {
    const timer = disconnectTimersRef.current.get(remoteUserId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimersRef.current.delete(remoteUserId);
    }
  }, []);

  const flushPendingCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteUserId);
    if (!pending?.length) return;

    log("flush_ice_candidates", { count: pending.length, remoteUserId });

    for (const c of pending) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(c));
      } catch (e: any) {
        log("flush_ice_candidate_error", { remoteUserId, error: e?.message });
      }
    }

    pendingCandidatesRef.current.delete(remoteUserId);
  }, [log]);

  const syncLocalTracksToPeer = useCallback((remoteUserId: string, pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;

    const senders = pc.getSenders();

    for (const track of stream.getTracks()) {
      const sender = senders.find((s) => s.track?.kind === track.kind);
      if (!sender) {
        pc.addTrack(track, stream);
        log("local_track_added", { remoteUserId, kind: track.kind });
        continue;
      }

      if (sender.track?.id !== track.id) {
        sender.replaceTrack(track).catch((e) => {
          log("replace_track_error", { remoteUserId, kind: track.kind, error: (e as Error)?.message });
        });
      }
    }
  }, [log]);

  const logSelectedCandidatePair = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats();
      let selectedPair: any = null;
      let transportReport: any = null;

      stats.forEach((report: any) => {
        if (report.type === "transport" && report.selectedCandidatePairId) {
          transportReport = report;
          selectedPair = stats.get(report.selectedCandidatePairId);
        }
      });

      if (!selectedPair) {
        stats.forEach((report: any) => {
          if (report.type === "candidate-pair" && (report.selected || report.nominated)) {
            selectedPair = report;
          }
        });
      }

      if (!selectedPair) {
        log("selected_candidate_pair_missing", { remoteUserId });
        return;
      }

      const localCandidate = selectedPair.localCandidateId ? stats.get(selectedPair.localCandidateId) : null;
      const remoteCandidate = selectedPair.remoteCandidateId ? stats.get(selectedPair.remoteCandidateId) : null;

      log("selected_candidate_pair", {
        remoteUserId,
        localType: localCandidate?.candidateType,
        remoteType: remoteCandidate?.candidateType,
        protocol: localCandidate?.protocol,
        networkType: localCandidate?.networkType,
        currentRoundTripTime: selectedPair.currentRoundTripTime,
        availableOutgoingBitrate: selectedPair.availableOutgoingBitrate,
        dtlsState: transportReport?.dtlsState,
      });
    } catch (e: any) {
      log("selected_candidate_pair_error", { remoteUserId, error: e?.message });
    }
  }, [log]);

  const runNegotiation = useCallback(async (
    remoteUserId: string,
    pc: RTCPeerConnection,
    iceRestart = false,
  ) => {
    const state = getNegotiationState(remoteUserId);

    if (applyingRemoteOfferRef.current.has(remoteUserId)) {
      log("negotiation_skipped_applying_offer", { remoteUserId, iceRestart });
      return;
    }

    if (state.isNegotiating) {
      state.pending = true;
      state.pendingIceRestart = state.pendingIceRestart || iceRestart;
      log("negotiation_queued_busy", { remoteUserId, iceRestart });
      return;
    }

    if (pc.signalingState !== "stable") {
      state.pending = true;
      state.pendingIceRestart = state.pendingIceRestart || iceRestart;
      log("negotiation_queued_unstable", { remoteUserId, state: pc.signalingState, iceRestart });
      return;
    }

    const shouldRestartIce = iceRestart || state.pendingIceRestart;
    state.pendingIceRestart = false;
    state.isNegotiating = true;

    try {
      const offer = await pc.createOffer(shouldRestartIce ? { iceRestart: true } : undefined);
      await pc.setLocalDescription(offer);
      log("offer_created", { remoteUserId, iceRestart: shouldRestartIce });
      offerHandlerRef.current?.(remoteUserId, offer, { iceRestart: shouldRestartIce });
    } catch (e: any) {
      log("offer_error", { remoteUserId, error: e?.message, iceRestart: shouldRestartIce });
    } finally {
      state.isNegotiating = false;
      if (state.pending) {
        const pendingRestart = state.pendingIceRestart;
        state.pending = false;
        state.pendingIceRestart = false;
        queueMicrotask(() => {
          void runNegotiation(remoteUserId, pc, pendingRestart);
        });
      }
    }
  }, [getNegotiationState, log]);

  const getOrCreatePC = useCallback((
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ): RTCPeerConnection => {
    const existing = peerConnectionsRef.current.get(remoteUserId);
    if (existing && existing.signalingState !== "closed") {
      syncLocalTracksToPeer(remoteUserId, existing);
      return existing;
    }

    log("pc_create", { remoteUserId });
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        log("ice_gathering_complete", { remoteUserId });
        return;
      }

      log("local_ice_candidate", {
        remoteUserId,
        candidateType: parseCandidateType(event.candidate.candidate),
        transport: parseCandidateTransport(event.candidate.candidate),
      });

      onIceCandidate(event.candidate);
    };

    pc.onicecandidateerror = (event: any) => {
      log("ice_candidate_error", {
        remoteUserId,
        url: event?.url,
        errorCode: event?.errorCode,
        errorText: event?.errorText,
      });
    };

    pc.onicegatheringstatechange = () => {
      log("ice_gathering_state", { remoteUserId, state: pc.iceGatheringState });
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log("ice_state", { remoteUserId, state });

      if (state === "connected" || state === "completed") {
        iceRestartCountRef.current.set(remoteUserId, 0);
        clearDisconnectTimer(remoteUserId);
        void logSelectedCandidatePair(remoteUserId, pc);
      }

      if (state === "failed") {
        clearDisconnectTimer(remoteUserId);
        const attempt = (iceRestartCountRef.current.get(remoteUserId) || 0) + 1;
        iceRestartCountRef.current.set(remoteUserId, attempt);

        if (attempt <= MAX_ICE_RESTARTS) {
          log("ice_restart", { remoteUserId, attempt });
          void runNegotiation(remoteUserId, pc, true);
        } else {
          log("ice_restart_exhausted", { remoteUserId, attempt });
          onDisconnected?.();
        }
      }

      if (state === "disconnected") {
        clearDisconnectTimer(remoteUserId);

        const timer = setTimeout(() => {
          const current = pc.iceConnectionState;
          if (current !== "disconnected" && current !== "failed") return;

          const attempt = (iceRestartCountRef.current.get(remoteUserId) || 0) + 1;
          iceRestartCountRef.current.set(remoteUserId, attempt);

          if (attempt <= MAX_ICE_RESTARTS) {
            log("ice_restart_disconnected", { remoteUserId, attempt, state: current });
            void runNegotiation(remoteUserId, pc, true);
            return;
          }

          log("disconnect_exhausted", { remoteUserId, attempt, state: current });
          onDisconnected?.();
        }, DISCONNECT_GRACE_MS);

        disconnectTimersRef.current.set(remoteUserId, timer);
      }
    };

    pc.onconnectionstatechange = () => {
      log("conn_state", { remoteUserId, state: pc.connectionState });
      if (pc.connectionState === "connected") {
        void logSelectedCandidatePair(remoteUserId, pc);
      }
    };

    pc.onsignalingstatechange = () => {
      log("sig_state", { remoteUserId, state: pc.signalingState });
      if (pc.signalingState === "stable") {
        const state = getNegotiationState(remoteUserId);
        if (state.pending) {
          const pendingRestart = state.pendingIceRestart;
          state.pending = false;
          state.pendingIceRestart = false;
          queueMicrotask(() => {
            void runNegotiation(remoteUserId, pc, pendingRestart);
          });
        }
      }
    };

    pc.onnegotiationneeded = () => {
      log("negotiation_needed", { remoteUserId, signalingState: pc.signalingState });
      void runNegotiation(remoteUserId, pc, false);
    };

    pc.ontrack = (event) => {
      log("remote_track", {
        remoteUserId,
        kind: event.track.kind,
        readyState: event.track.readyState,
      });

      const stream = event.streams[0];
      if (!stream) return;

      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.set(remoteUserId, stream);
        return next;
      });
    };

    syncLocalTracksToPeer(remoteUserId, pc);
    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, [clearDisconnectTimer, getNegotiationState, log, logSelectedCandidatePair, runNegotiation, syncLocalTracksToPeer]);

  const getMedia = useCallback(async (video: boolean) => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      const hasAudio = tracks.some((t) => t.kind === "audio" && t.readyState === "live");
      const hasVideo = !video || tracks.some((t) => t.kind === "video" && t.readyState === "live");
      if (hasAudio && hasVideo) return localStreamRef.current;
      tracks.forEach((t) => t.stop());
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video
          ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
      });

      localStreamRef.current = stream;
      setLocalStream(stream);

      log("media_acquired", { tracks: stream.getTracks().map((t) => `${t.kind}:${t.readyState}`) });

      peerConnectionsRef.current.forEach((pc, remoteUserId) => {
        syncLocalTracksToPeer(remoteUserId, pc);
      });

      return stream;
    } catch (err: any) {
      log("media_error", { name: err?.name, message: err?.message });
      throw new Error(err?.name === "NotAllowedError" ? "no_permission" : "media_error");
    }
  }, [log, syncLocalTracksToPeer]);

  const ensurePeerConnection = useCallback((
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ) => {
    getOrCreatePC(remoteUserId, onIceCandidate, onDisconnected);
  }, [getOrCreatePC]);

  const requestRenegotiation = useCallback((remoteUserId: string, iceRestart = false) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (!pc || pc.signalingState === "closed") return;
    void runNegotiation(remoteUserId, pc, iceRestart);
  }, [runNegotiation]);

  const handleOffer = useCallback(async (
    remoteUserId: string,
    offer: RTCSessionDescriptionInit,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ) => {
    applyingRemoteOfferRef.current.add(remoteUserId);
    const pc = getOrCreatePC(remoteUserId, onIceCandidate, onDisconnected);

    try {
      if (pc.signalingState === "have-local-offer") {
        log("glare_rollback", { remoteUserId });
        await pc.setLocalDescription({ type: "rollback" });
      }

      if (pc.signalingState !== "stable") {
        log("offer_rejected_state", { remoteUserId, state: pc.signalingState });
        return null;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await flushPendingCandidates(remoteUserId, pc);

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("answer_created", { remoteUserId });
      return answer;
    } catch (e: any) {
      log("handle_offer_error", { remoteUserId, error: e?.message });
      return null;
    } finally {
      applyingRemoteOfferRef.current.delete(remoteUserId);
    }
  }, [flushPendingCandidates, getOrCreatePC, log]);

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
      log("answer_error", { remoteUserId, error: e?.message });
    }
  }, [flushPendingCandidates, log]);

  const handleIceCandidate = useCallback(async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);

    log("remote_ice_candidate", {
      remoteUserId,
      candidateType: parseCandidateType(candidate?.candidate),
      transport: parseCandidateTransport(candidate?.candidate),
    });

    if (pc?.remoteDescription?.type) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e: any) {
        log("add_ice_candidate_error", { remoteUserId, error: e?.message });
      }
      return;
    }

    if (!pendingCandidatesRef.current.has(remoteUserId)) {
      pendingCandidatesRef.current.set(remoteUserId, []);
    }

    pendingCandidatesRef.current.get(remoteUserId)!.push(candidate);
  }, [log]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsMuted((prev) => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach((t) => {
      t.enabled = !t.enabled;
    });
    setIsCameraOff((prev) => !prev);
  }, []);

  const cleanup = useCallback(() => {
    log("cleanup");

    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    peerConnectionsRef.current.forEach((pc) => {
      pc.onicecandidate = null;
      pc.onicecandidateerror = null;
      pc.onicegatheringstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.onsignalingstatechange = null;
      pc.ontrack = null;
      pc.onnegotiationneeded = null;
      pc.close();
    });

    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    negotiationStateRef.current.clear();
    iceRestartCountRef.current.clear();
    applyingRemoteOfferRef.current.clear();

    disconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    disconnectTimersRef.current.clear();

    setRemoteStreams(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
  }, [log]);

  useEffect(() => () => {
    cleanup();
  }, [cleanup]);

  return {
    localStream,
    remoteStreams,
    isMuted,
    isCameraOff,
    getMedia,
    ensurePeerConnection,
    requestRenegotiation,
    handleOffer,
    handleAnswer,
    handleIceCandidate,
    toggleMute,
    toggleCamera,
    cleanup,
    setLogger,
    setOfferHandler,
  };
};

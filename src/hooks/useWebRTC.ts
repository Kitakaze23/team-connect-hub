import { useCallback, useRef, useState, useEffect } from "react";
import { ICE_CONFIG, ICE_RESTART_COOLDOWN_MS, DISCONNECT_GRACE_MS } from "./webrtc/iceConfig";
import { acquireMedia } from "./webrtc/mediaConstraints";
import { applyBitrateLimit, configureSimulcast, type NetworkQuality } from "./webrtc/bitrateControl";
import { collectStats, clearStatsFor, type NetworkStats } from "./webrtc/networkMonitor";
import { applyCodecPreferences } from "./webrtc/codecOptimizer";

// ── Constants ──
const STATS_INTERVAL_MS = 5_000;

type LogFn = (event: string, details?: Record<string, any>) => void;
type OfferHandlerFn = (
  remoteUserId: string,
  offer: RTCSessionDescriptionInit,
  meta: { iceRestart: boolean },
) => void;

// ── Per-peer state for perfect negotiation ──
interface PeerState {
  pc: RTCPeerConnection;
  makingOffer: boolean;
  ignoreOffer: boolean;
  polite: boolean;
  lastIceRestartAt: number;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
  pendingCandidates: RTCIceCandidateInit[];
  lastQuality: NetworkQuality;
}

const parseCandidateType = (c?: string) => c?.match(/\btyp\s([a-z0-9]+)/i)?.[1] ?? "unknown";
const parseCandidateTransport = (c?: string) => c?.match(/\b(udp|tcp)\b/i)?.[1]?.toLowerCase() ?? "unknown";

export const useWebRTC = () => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>("unknown");

  const loggerRef = useRef<LogFn>(() => {});
  const offerHandlerRef = useRef<OfferHandlerFn | null>(null);
  const myUserIdRef = useRef<string | null>(null);
  const statsTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const setLogger = useCallback((fn: LogFn) => { loggerRef.current = fn; }, []);
  const setOfferHandler = useCallback((fn: OfferHandlerFn) => { offerHandlerRef.current = fn; }, []);
  const setMyUserId = useCallback((id: string) => { myUserIdRef.current = id; }, []);

  const log = useCallback((event: string, details?: Record<string, any>) => {
    loggerRef.current(event, details);
  }, []);

  // ── Determine politeness: lower ID = polite ──
  const isPolite = useCallback((remoteUserId: string): boolean => {
    const myId = myUserIdRef.current;
    if (!myId) return false;
    return myId < remoteUserId;
  }, []);

  // ── Add local tracks to PC ──
  const syncLocalTracks = useCallback((remoteUserId: string, pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const senders = pc.getSenders();
    for (const track of stream.getTracks()) {
      const sender = senders.find(s => s.track?.kind === track.kind);
      if (!sender) {
        pc.addTrack(track, stream);
        log("track_added", { remoteUserId, kind: track.kind });
      } else if (sender.track?.id !== track.id) {
        sender.replaceTrack(track).catch(e =>
          log("replace_track_error", { remoteUserId, kind: track.kind, error: (e as Error)?.message })
        );
      }
    }
  }, [log]);

  // ── Log selected candidate pair ──
  const logCandidatePair = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    try {
      const stats = await pc.getStats();
      let pair: any = null;
      stats.forEach((r: any) => {
        if (r.type === "candidate-pair" && (r.selected || r.nominated || r.state === "succeeded")) {
          pair = r;
        }
      });
      if (!pair) {
        stats.forEach((r: any) => {
          if (r.type === "transport" && r.selectedCandidatePairId) {
            pair = stats.get(r.selectedCandidatePairId);
          }
        });
      }
      if (!pair) return;
      const local = pair.localCandidateId ? stats.get(pair.localCandidateId) : null;
      const remote = pair.remoteCandidateId ? stats.get(pair.remoteCandidateId) : null;
      log("selected_candidate_pair", {
        remoteUserId,
        localType: local?.candidateType,
        remoteType: remote?.candidateType,
        protocol: local?.protocol,
        rtt: pair.currentRoundTripTime,
        bitrate: pair.availableOutgoingBitrate,
      });
    } catch {}
  }, [log]);

  // ── ICE restart with cooldown ──
  const triggerIceRestart = useCallback((remoteUserId: string) => {
    const peer = peersRef.current.get(remoteUserId);
    if (!peer || peer.pc.signalingState === "closed") return;

    const now = Date.now();
    if (now - peer.lastIceRestartAt < ICE_RESTART_COOLDOWN_MS) {
      log("ice_restart_cooldown", { remoteUserId, elapsed: now - peer.lastIceRestartAt });
      return;
    }

    if (peer.makingOffer) {
      log("ice_restart_deferred_making_offer", { remoteUserId });
      return;
    }

    peer.lastIceRestartAt = now;
    log("ice_restart", { remoteUserId });

    (async () => {
      try {
        peer.makingOffer = true;
        const offer = await peer.pc.createOffer({ iceRestart: true });
        await peer.pc.setLocalDescription(offer);
        log("ice_restart_offer_created", { remoteUserId });
        offerHandlerRef.current?.(remoteUserId, peer.pc.localDescription!, { iceRestart: true });
      } catch (e: any) {
        log("ice_restart_error", { remoteUserId, error: e?.message });
      } finally {
        peer.makingOffer = false;
      }
    })();
  }, [log]);

  // ── Network stats monitoring ──
  const startStatsMonitor = useCallback(() => {
    if (statsTimerRef.current) return;

    statsTimerRef.current = setInterval(async () => {
      let worstQuality: NetworkQuality = "good";

      for (const [peerId, peer] of peersRef.current) {
        if (peer.pc.connectionState !== "connected") continue;

        const stats = await collectStats(peerId, peer.pc);
        if (!stats) continue;

        log("network_stats", {
          peerId,
          quality: stats.quality,
          rtt: Math.round(stats.rtt),
          jitter: Math.round(stats.jitter * 10) / 10,
          packetLoss: Math.round(stats.packetLoss * 10) / 10,
          bitrateSend: Math.round(stats.bitrateSend / 1000),
          bitrateRecv: Math.round(stats.bitrateRecv / 1000),
          localCandidate: stats.localCandidateType,
          remoteCandidate: stats.remoteCandidateType,
        });

        // Apply adaptive bitrate if quality changed
        if (stats.quality !== peer.lastQuality) {
          peer.lastQuality = stats.quality;
          await applyBitrateLimit(peer.pc, stats.quality, log);
        }

        // Track worst quality across all peers
        const qualityOrder: NetworkQuality[] = ["good", "medium", "poor"];
        if (qualityOrder.indexOf(stats.quality) > qualityOrder.indexOf(worstQuality)) {
          worstQuality = stats.quality;
        }
      }

      setNetworkQuality(worstQuality);
    }, STATS_INTERVAL_MS);
  }, [log]);

  const stopStatsMonitor = useCallback(() => {
    if (statsTimerRef.current) {
      clearInterval(statsTimerRef.current);
      statsTimerRef.current = null;
    }
  }, []);

  // ── Create PeerConnection with perfect negotiation ──
  const getOrCreatePeer = useCallback((
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ): PeerState => {
    const existing = peersRef.current.get(remoteUserId);
    if (existing && existing.pc.signalingState !== "closed") {
      syncLocalTracks(remoteUserId, existing.pc);
      return existing;
    }

    const polite = isPolite(remoteUserId);
    log("pc_create", { remoteUserId, polite });

    const pc = new RTCPeerConnection(ICE_CONFIG);
    const peer: PeerState = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      polite,
      lastIceRestartAt: 0,
      disconnectTimer: null,
      pendingCandidates: [],
      lastQuality: "unknown",
    };

    // Apply codec preferences early
    applyCodecPreferences(pc, log);

    // ── onnegotiationneeded — perfect negotiation ──
    pc.onnegotiationneeded = async () => {
      log("negotiation_needed", { remoteUserId, signalingState: pc.signalingState });
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        log("offer_created", { remoteUserId });
        offerHandlerRef.current?.(remoteUserId, pc.localDescription!, { iceRestart: false });
      } catch (e: any) {
        log("offer_error", { remoteUserId, error: e?.message });
      } finally {
        peer.makingOffer = false;
      }
    };

    // ── ICE candidates ──
    pc.onicecandidate = (event) => {
      if (!event.candidate) {
        log("ice_gathering_complete", { remoteUserId });
        return;
      }
      log("local_ice_candidate", {
        remoteUserId,
        type: parseCandidateType(event.candidate.candidate),
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

    // ── ICE connection state — with grace period + cooldown ──
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log("ice_state", { remoteUserId, state });

      if (peer.disconnectTimer) {
        clearTimeout(peer.disconnectTimer);
        peer.disconnectTimer = null;
      }

      if (state === "connected" || state === "completed") {
        void logCandidatePair(remoteUserId, pc);
        // Configure simulcast + initial bitrate on connection
        configureSimulcast(pc, log);
        startStatsMonitor();
      }

      if (state === "disconnected") {
        peer.disconnectTimer = setTimeout(() => {
          if (pc.iceConnectionState === "disconnected" || pc.iceConnectionState === "failed") {
            log("disconnect_grace_expired", { remoteUserId, currentState: pc.iceConnectionState });
            triggerIceRestart(remoteUserId);
          }
        }, DISCONNECT_GRACE_MS);
      }

      if (state === "failed") {
        triggerIceRestart(remoteUserId);
      }
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      log("conn_state", { remoteUserId, state });
      if (state === "connected") {
        void logCandidatePair(remoteUserId, pc);
      }
      if (state === "failed") {
        log("connection_failed_final", { remoteUserId });
        onDisconnected?.();
      }
    };

    pc.onsignalingstatechange = () => {
      log("sig_state", { remoteUserId, state: pc.signalingState });
    };

    // ── Remote tracks ──
    pc.ontrack = (event) => {
      log("remote_track", {
        remoteUserId,
        kind: event.track.kind,
        readyState: event.track.readyState,
      });
      const stream = event.streams[0];
      if (!stream) return;

      // Listen for track ended to clean up
      event.track.onended = () => {
        log("remote_track_ended", { remoteUserId, kind: event.track.kind });
      };

      event.track.onmute = () => {
        log("remote_track_muted", { remoteUserId, kind: event.track.kind });
      };

      event.track.onunmute = () => {
        log("remote_track_unmuted", { remoteUserId, kind: event.track.kind });
      };

      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(remoteUserId, stream);
        return next;
      });
    };

    syncLocalTracks(remoteUserId, pc);
    peersRef.current.set(remoteUserId, peer);
    return peer;
  }, [isPolite, log, logCandidatePair, syncLocalTracks, triggerIceRestart, startStatsMonitor]);

  // ── Get media ──
  const getMedia = useCallback(async (video: boolean) => {
    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      const hasAudio = tracks.some(t => t.kind === "audio" && t.readyState === "live");
      const hasVideo = !video || tracks.some(t => t.kind === "video" && t.readyState === "live");
      if (hasAudio && hasVideo) return localStreamRef.current;
      tracks.forEach(t => t.stop());
    }

    const result = await acquireMedia(video, log);
    localStreamRef.current = result.stream;
    setLocalStream(result.stream);

    if (result.videoDowngraded) {
      log("media_quality_downgraded", { videoDowngraded: true });
    }

    // Sync to all existing PCs
    peersRef.current.forEach((peer, id) => {
      syncLocalTracks(id, peer.pc);
    });

    return result.stream;
  }, [log, syncLocalTracks]);

  // ── Ensure PC exists ──
  const ensurePeerConnection = useCallback((
    remoteUserId: string,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ) => {
    getOrCreatePeer(remoteUserId, onIceCandidate, onDisconnected);
  }, [getOrCreatePeer]);

  // ── Handle incoming offer — perfect negotiation ──
  const handleOffer = useCallback(async (
    remoteUserId: string,
    offer: RTCSessionDescriptionInit,
    onIceCandidate: (candidate: RTCIceCandidate) => void,
    onDisconnected?: () => void,
  ) => {
    const peer = getOrCreatePeer(remoteUserId, onIceCandidate, onDisconnected);
    const pc = peer.pc;

    const offerCollision = peer.makingOffer || pc.signalingState !== "stable";
    peer.ignoreOffer = !peer.polite && offerCollision;

    if (peer.ignoreOffer) {
      log("offer_ignored_impolite_glare", { remoteUserId, signalingState: pc.signalingState });
      return null;
    }

    try {
      if (offerCollision) {
        log("glare_rollback", { remoteUserId });
      }

      await pc.setRemoteDescription(offer);

      // Flush pending ICE candidates
      if (peer.pendingCandidates.length > 0) {
        log("flush_ice_candidates", { count: peer.pendingCandidates.length, remoteUserId });
        for (const c of peer.pendingCandidates) {
          try { await pc.addIceCandidate(c); } catch {}
        }
        peer.pendingCandidates = [];
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      log("answer_created", { remoteUserId });
      return answer;
    } catch (e: any) {
      log("handle_offer_error", { remoteUserId, error: e?.message });
      return null;
    }
  }, [getOrCreatePeer, log]);

  // ── Handle incoming answer ──
  const handleAnswer = useCallback(async (remoteUserId: string, answer: RTCSessionDescriptionInit) => {
    const peer = peersRef.current.get(remoteUserId);
    if (!peer) return;

    if (peer.pc.signalingState !== "have-local-offer") {
      log("answer_rejected_state", { remoteUserId, state: peer.pc.signalingState });
      return;
    }

    try {
      await peer.pc.setRemoteDescription(answer);
      log("answer_applied", { remoteUserId });

      // Flush pending ICE
      if (peer.pendingCandidates.length > 0) {
        log("flush_ice_candidates", { count: peer.pendingCandidates.length, remoteUserId });
        for (const c of peer.pendingCandidates) {
          try { await peer.pc.addIceCandidate(c); } catch {}
        }
        peer.pendingCandidates = [];
      }
    } catch (e: any) {
      log("answer_error", { remoteUserId, error: e?.message });
    }
  }, [log]);

  // ── Handle ICE candidate ──
  const handleIceCandidate = useCallback(async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(remoteUserId);

    log("remote_ice_candidate", {
      remoteUserId,
      type: parseCandidateType(candidate?.candidate),
      transport: parseCandidateTransport(candidate?.candidate),
    });

    if (!peer) return;

    if (peer.pc.remoteDescription?.type) {
      try {
        await peer.pc.addIceCandidate(candidate);
      } catch (e: any) {
        if (!peer.ignoreOffer) {
          log("add_ice_error", { remoteUserId, error: e?.message });
        }
      }
      return;
    }

    peer.pendingCandidates.push(candidate);
  }, [log]);

  // ── Request renegotiation ──
  const requestRenegotiation = useCallback((remoteUserId: string, iceRestart = false) => {
    const peer = peersRef.current.get(remoteUserId);
    if (!peer || peer.pc.signalingState === "closed") return;

    if (iceRestart) {
      triggerIceRestart(remoteUserId);
    } else {
      if (peer.makingOffer || peer.pc.signalingState !== "stable") {
        log("renegotiation_deferred", { remoteUserId, signalingState: peer.pc.signalingState });
        return;
      }
      (async () => {
        try {
          peer.makingOffer = true;
          await peer.pc.setLocalDescription();
          log("renegotiation_offer_created", { remoteUserId });
          offerHandlerRef.current?.(remoteUserId, peer.pc.localDescription!, { iceRestart: false });
        } catch (e: any) {
          log("renegotiation_error", { remoteUserId, error: e?.message });
        } finally {
          peer.makingOffer = false;
        }
      })();
    }
  }, [log, triggerIceRestart]);

  const toggleMute = useCallback(() => {
    localStreamRef.current?.getAudioTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsMuted(prev => !prev);
  }, []);

  const toggleCamera = useCallback(() => {
    localStreamRef.current?.getVideoTracks().forEach(t => { t.enabled = !t.enabled; });
    setIsCameraOff(prev => !prev);
  }, []);

  const cleanup = useCallback(() => {
    log("cleanup");
    stopStatsMonitor();

    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    peersRef.current.forEach((peer, peerId) => {
      if (peer.disconnectTimer) clearTimeout(peer.disconnectTimer);
      clearStatsFor(peerId);
      pc_cleanupHandlers(peer.pc);
      peer.pc.close();
    });
    peersRef.current.clear();

    setRemoteStreams(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
    setNetworkQuality("unknown");
  }, [log, stopStatsMonitor]);

  useEffect(() => () => { cleanup(); }, [cleanup]);

  return {
    localStream,
    remoteStreams,
    isMuted,
    isCameraOff,
    networkQuality,
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
    setMyUserId,
  };
};

// ── Helper: remove all handlers from a PC to avoid leaks ──
function pc_cleanupHandlers(pc: RTCPeerConnection) {
  pc.onicecandidate = null;
  pc.onicecandidateerror = null;
  pc.onicegatheringstatechange = null;
  pc.oniceconnectionstatechange = null;
  pc.onconnectionstatechange = null;
  pc.onsignalingstatechange = null;
  pc.ontrack = null;
  pc.onnegotiationneeded = null;
}

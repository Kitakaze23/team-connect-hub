import { useCallback, useRef, useState, useEffect } from "react";

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export interface Participant {
  userId: string;
  stream: MediaStream | null;
  isMuted: boolean;
  isCameraOff: boolean;
  name: string;
  avatarUrl: string | null;
}

export const useWebRTC = () => {
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(new Map());
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [connectionState, setConnectionState] = useState<string>("new");

  const getMedia = useCallback(async (video: boolean) => {
    try {
      console.log("[WebRTC] Requesting media:", { audio: true, video });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      console.log("[WebRTC] Media acquired, tracks:", stream.getTracks().map(t => `${t.kind}:${t.readyState}`));
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err: any) {
      console.error("[WebRTC] Media error:", err.name, err.message);
      throw new Error(err.name === "NotAllowedError" ? "no_permission" : "media_error");
    }
  }, []);

  const flushPendingCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteUserId);
    if (pending && pending.length > 0) {
      console.log(`[WebRTC] Flushing ${pending.length} pending ICE candidates for ${remoteUserId}`);
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("[WebRTC] Error adding queued ICE candidate:", e);
        }
      }
      pendingCandidatesRef.current.delete(remoteUserId);
    }
  }, []);

  const createPeerConnection = useCallback((remoteUserId: string, onIceCandidate: (candidate: RTCIceCandidate) => void) => {
    console.log("[WebRTC] Creating PeerConnection for:", remoteUserId);
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log("[WebRTC] ICE candidate generated for:", remoteUserId);
        onIceCandidate(event.candidate);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC] ICE connection state [${remoteUserId}]:`, pc.iceConnectionState);
    };

    pc.onsignalingstatechange = () => {
      console.log(`[WebRTC] Signaling state [${remoteUserId}]:`, pc.signalingState);
    };

    pc.ontrack = (event) => {
      console.log(`[WebRTC] Remote track received [${remoteUserId}]:`, event.track.kind, event.track.readyState);
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(remoteUserId, event.streams[0]);
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC] Connection state [${remoteUserId}]:`, pc.connectionState);
      setConnectionState(pc.connectionState);
    };

    if (localStreamRef.current) {
      const tracks = localStreamRef.current.getTracks();
      console.log(`[WebRTC] Adding ${tracks.length} local tracks to PC`);
      tracks.forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    } else {
      console.warn("[WebRTC] No local stream when creating PeerConnection!");
    }

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, []);

  const createOffer = useCallback(async (remoteUserId: string, onIceCandidate: (candidate: RTCIceCandidate) => void) => {
    console.log("[WebRTC] Creating offer for:", remoteUserId);
    const pc = createPeerConnection(remoteUserId, onIceCandidate);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    console.log("[WebRTC] Offer created and set as local description");
    return offer;
  }, [createPeerConnection]);

  const handleOffer = useCallback(async (
    remoteUserId: string,
    offer: RTCSessionDescriptionInit,
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ) => {
    console.log("[WebRTC] Handling offer from:", remoteUserId);
    const pc = createPeerConnection(remoteUserId, onIceCandidate);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log("[WebRTC] Remote description set (offer)");
    await flushPendingCandidates(remoteUserId, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    console.log("[WebRTC] Answer created and set as local description");
    return answer;
  }, [createPeerConnection, flushPendingCandidates]);

  const handleAnswer = useCallback(async (remoteUserId: string, answer: RTCSessionDescriptionInit) => {
    console.log("[WebRTC] Handling answer from:", remoteUserId);
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("[WebRTC] Remote description set (answer)");
      await flushPendingCandidates(remoteUserId, pc);
    } else {
      console.warn("[WebRTC] No PeerConnection found for:", remoteUserId);
    }
  }, [flushPendingCandidates]);

  const handleIceCandidate = useCallback(async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC] ICE candidate added for:", remoteUserId);
      } catch (e) {
        console.warn("[WebRTC] Error adding ICE candidate:", e);
      }
    } else {
      if (!pendingCandidatesRef.current.has(remoteUserId)) {
        pendingCandidatesRef.current.set(remoteUserId, []);
      }
      pendingCandidatesRef.current.get(remoteUserId)!.push(candidate);
      console.log(`[WebRTC] Queued ICE candidate for ${remoteUserId}, total queued: ${pendingCandidatesRef.current.get(remoteUserId)!.length}`);
    }
  }, []);

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
    console.log("[WebRTC] Cleanup");
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();
    pendingCandidatesRef.current.clear();
    setRemoteStreams(new Map());
    setIsMuted(false);
    setIsCameraOff(false);
    setConnectionState("new");
  }, []);

  useEffect(() => {
    return () => { cleanup(); };
  }, [cleanup]);

  return {
    localStream, remoteStreams, isMuted, isCameraOff, connectionState,
    getMedia, createOffer, handleOffer, handleAnswer, handleIceCandidate,
    toggleMute, toggleCamera, cleanup,
  };
};

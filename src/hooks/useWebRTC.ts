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
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
      });
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err: any) {
      throw new Error(err.name === "NotAllowedError" ? "no_permission" : "media_error");
    }
  }, []);

  const flushPendingCandidates = useCallback(async (remoteUserId: string, pc: RTCPeerConnection) => {
    const pending = pendingCandidatesRef.current.get(remoteUserId);
    if (pending && pending.length > 0) {
      for (const candidate of pending) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("Error adding queued ICE candidate:", e);
        }
      }
      pendingCandidatesRef.current.delete(remoteUserId);
    }
  }, []);

  const createPeerConnection = useCallback((remoteUserId: string, onIceCandidate: (candidate: RTCIceCandidate) => void) => {
    const pc = new RTCPeerConnection(ICE_SERVERS);

    pc.onicecandidate = (event) => {
      if (event.candidate) onIceCandidate(event.candidate);
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => {
        const next = new Map(prev);
        next.set(remoteUserId, event.streams[0]);
        return next;
      });
    };

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState);
    };

    // Add local tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    peerConnectionsRef.current.set(remoteUserId, pc);
    return pc;
  }, []);

  const createOffer = useCallback(async (remoteUserId: string, onIceCandidate: (candidate: RTCIceCandidate) => void) => {
    const pc = createPeerConnection(remoteUserId, onIceCandidate);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    return offer;
  }, [createPeerConnection]);

  const handleOffer = useCallback(async (
    remoteUserId: string,
    offer: RTCSessionDescriptionInit,
    onIceCandidate: (candidate: RTCIceCandidate) => void
  ) => {
    const pc = createPeerConnection(remoteUserId, onIceCandidate);
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
    // Flush any candidates that arrived before the PC was ready
    await flushPendingCandidates(remoteUserId, pc);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    return answer;
  }, [createPeerConnection, flushPendingCandidates]);

  const handleAnswer = useCallback(async (remoteUserId: string, answer: RTCSessionDescriptionInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));
      // Flush any candidates that arrived before the answer was set
      await flushPendingCandidates(remoteUserId, pc);
    }
  }, [flushPendingCandidates]);

  const handleIceCandidate = useCallback(async (remoteUserId: string, candidate: RTCIceCandidateInit) => {
    const pc = peerConnectionsRef.current.get(remoteUserId);
    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        console.warn("Error adding ICE candidate:", e);
      }
    } else {
      // Queue the candidate for later
      if (!pendingCandidatesRef.current.has(remoteUserId)) {
        pendingCandidatesRef.current.set(remoteUserId, []);
      }
      pendingCandidatesRef.current.get(remoteUserId)!.push(candidate);
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

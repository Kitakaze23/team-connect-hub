import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff } from "lucide-react";
import { useCall } from "@/contexts/CallContext";
import { useCallback, useEffect, useRef } from "react";

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const CallOverlay = () => {
  const {
    callState, callType, participants, caller, callDuration,
    localStream, remoteStreams, isMuted, isCameraOff,
    acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
  } = useCall();

  // Use callback refs so we re-attach whenever the DOM element changes (e.g. outgoing→active)
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

  const attachStream = (el: HTMLMediaElement | null, stream: MediaStream | null) => {
    if (!el) return;
    if (!stream) { el.srcObject = null; return; }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => {});
  };

  // Callback ref for local video — fires every time the <video> mounts/unmounts
  const setLocalVideoRef = useCallback((node: HTMLVideoElement | null) => {
    localVideoRef.current = node;
    attachStream(node, localStream);
  }, [localStream]);

  // Re-attach when localStream changes on existing element
  useEffect(() => {
    attachStream(localVideoRef.current, localStream);
  }, [localStream]);

  // Callback ref for remote video
  const firstRemoteStream = remoteStreams.size > 0
    ? remoteStreams.values().next().value ?? null
    : null;

  const setRemoteVideoRef = useCallback((node: HTMLVideoElement | null) => {
    remoteVideoRef.current = node;
    attachStream(node, firstRemoteStream);
  }, [firstRemoteStream]);

  // Re-attach when remoteStreams change on existing element
  useEffect(() => {
    attachStream(remoteVideoRef.current, firstRemoteStream);
  }, [firstRemoteStream]);

  // Also re-attach when tracks inside the stream change (track added/removed/ended)
  useEffect(() => {
    if (!firstRemoteStream) return;
    const handler = () => {
      attachStream(remoteVideoRef.current, firstRemoteStream);
    };
    firstRemoteStream.addEventListener("addtrack", handler);
    firstRemoteStream.addEventListener("removetrack", handler);
    return () => {
      firstRemoteStream.removeEventListener("addtrack", handler);
      firstRemoteStream.removeEventListener("removetrack", handler);
    };
  }, [firstRemoteStream]);

  useEffect(() => {
    if (!localStream) return;
    const handler = () => {
      attachStream(localVideoRef.current, localStream);
    };
    localStream.addEventListener("addtrack", handler);
    localStream.addEventListener("removetrack", handler);
    return () => {
      localStream.removeEventListener("addtrack", handler);
      localStream.removeEventListener("removetrack", handler);
    };
  }, [localStream]);

  if (callState === "idle") return null;

  const targetName = callState === "incoming"
    ? caller?.name || "Неизвестный"
    : participants[0]?.name || "Неизвестный";
  const targetAvatar = callState === "incoming"
    ? caller?.avatarUrl
    : participants[0]?.avatarUrl;
  const initials = targetName.split(" ").map(n => n[0]).join("").slice(0, 2);

  const attachMediaStream = (node: HTMLMediaElement | null, stream: MediaStream | null) => {
    attachStream(node, stream);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        <div className="absolute inset-0 bg-background/95 backdrop-blur-xl" />

        <div className="relative z-10 flex flex-col items-center w-full max-w-lg mx-auto px-6">
          {/* Incoming Call */}
          {callState === "incoming" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6"
            >
              <motion.div
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ repeat: Infinity, duration: 2 }}
                className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center overflow-hidden"
              >
                {targetAvatar ? (
                  <img src={targetAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-mono font-bold text-foreground">{initials}</span>
                )}
              </motion.div>
              <div className="text-center">
                <h2 className="text-xl font-mono font-bold text-foreground">{targetName}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Входящий {callType === "video" ? "видео" : "аудио"}звонок...
                </p>
              </div>
              <div className="flex gap-6 mt-4">
                <button onClick={rejectCall}
                  className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
                  <PhoneOff className="w-7 h-7" />
                </button>
                <button onClick={acceptCall}
                  className="w-16 h-16 rounded-full bg-[hsl(var(--terminal-green))] text-white flex items-center justify-center hover:opacity-90 transition-opacity">
                  <Phone className="w-7 h-7" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Outgoing Call */}
          {callState === "outgoing" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center gap-6"
            >
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
                className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center overflow-hidden"
              >
                {targetAvatar ? (
                  <img src={targetAvatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-mono font-bold text-foreground">{initials}</span>
                )}
              </motion.div>
              <div className="text-center">
                <h2 className="text-xl font-mono font-bold text-foreground">{targetName}</h2>
                <p className="text-sm text-muted-foreground mt-1">Ожидание ответа...</p>
                <motion.div
                  className="flex justify-center gap-1 mt-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {[0, 1, 2].map(i => (
                    <motion.span
                      key={i}
                      className="w-2 h-2 rounded-full bg-accent"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.3 }}
                    />
                  ))}
                </motion.div>
              </div>

              {callType === "video" && localStream && (
                <div className="relative w-56 aspect-video rounded-xl overflow-hidden border border-border bg-secondary">
                  <video ref={setLocalVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  {isCameraOff && (
                    <div className="absolute inset-0 bg-secondary flex items-center justify-center">
                      <VideoOff className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
              )}

              <button onClick={endCall}
                className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity mt-4">
                <PhoneOff className="w-7 h-7" />
              </button>
            </motion.div>
          )}

          {/* Active Call */}
          {callState === "active" && (
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-col items-center w-full gap-4"
            >
              {callType === "video" ? (
                <div className="relative w-full aspect-video bg-secondary rounded-2xl overflow-hidden">
                  {firstRemoteStream ? (
                    <video ref={setRemoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                        {targetAvatar ? (
                          <img src={targetAvatar} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span className="text-xl font-mono font-bold text-foreground">{initials}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {localStream && (
                    <div className="absolute bottom-3 right-3 w-32 aspect-video rounded-xl overflow-hidden border-2 border-border shadow-lg">
                      <video ref={setLocalVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {isCameraOff && (
                        <div className="absolute inset-0 bg-secondary flex items-center justify-center">
                          <VideoOff className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 py-12">
                  <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center overflow-hidden">
                    {targetAvatar ? (
                      <img src={targetAvatar} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-mono font-bold text-foreground">{initials}</span>
                    )}
                  </div>
                  <h2 className="text-xl font-mono font-bold text-foreground">{targetName}</h2>
                </div>
              )}

              <div className="text-sm font-mono text-muted-foreground">
                {formatDuration(callDuration)}
              </div>

              <div className="flex gap-4 mt-2">
                <button onClick={toggleMute}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    isMuted ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground hover:bg-secondary/80"
                  }`}>
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                {callType === "video" && (
                  <button onClick={toggleCamera}
                    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      isCameraOff ? "bg-destructive/20 text-destructive" : "bg-secondary text-foreground hover:bg-secondary/80"
                    }`}>
                    {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                  </button>
                )}
                <button onClick={endCall}
                  className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
            </motion.div>
          )}

          {/* Hidden audio elements for remote streams */}
          {Array.from(remoteStreams.entries()).map(([participantId, stream], index) => {
            if (callType === "video" && index === 0) return null;
            return (
              <audio
                key={participantId}
                autoPlay
                playsInline
                className="hidden"
                ref={(node) => { attachMediaStream(node, stream); }}
              />
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CallOverlay;

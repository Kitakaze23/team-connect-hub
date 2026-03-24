import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, X } from "lucide-react";
import { useCall } from "@/contexts/CallContext";
import { useEffect, useRef } from "react";

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const CallOverlay = () => {
  const {
    callState, callType, isGroupCall, participants, caller, callDuration,
    localStream, remoteStreams, isMuted, isCameraOff,
    acceptCall, rejectCall, endCall, toggleMute, toggleCamera,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const attachMediaStream = (element: HTMLMediaElement | null, stream: MediaStream | null) => {
    if (!element) return;

    if (!stream) {
      element.srcObject = null;
      return;
    }

    if (element.srcObject !== stream) {
      element.srcObject = stream;
    }

    void element.play().catch(() => {
      // autoplay can be blocked by browser policy; user action will allow playback
    });
  };

  useEffect(() => {
    attachMediaStream(localVideoRef.current, localStream);
  }, [localStream]);

  useEffect(() => {
    const firstStream = remoteStreams.values().next().value ?? null;
    attachMediaStream(remoteVideoRef.current, firstStream);
  }, [remoteStreams]);

  if (callState === "idle") return null;

  const targetName = callState === "incoming"
    ? caller?.name || "Неизвестный"
    : participants[0]?.name || "Неизвестный";
  const targetAvatar = callState === "incoming"
    ? caller?.avatarUrl
    : participants[0]?.avatarUrl;
  const initials = targetName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
      >
        {/* Backdrop */}
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
                <div className="w-56 aspect-video rounded-xl overflow-hidden border border-border bg-secondary">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
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
              {/* Video area */}
              {callType === "video" ? (
                <div className="relative w-full aspect-video bg-secondary rounded-2xl overflow-hidden">
                  {remoteStreams.size > 0 ? (
                    <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
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
                  {/* PiP local video */}
                  {localStream && (
                    <div className="absolute bottom-3 right-3 w-32 aspect-video rounded-xl overflow-hidden border-2 border-border shadow-lg">
                      <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                      {isCameraOff && (
                        <div className="absolute inset-0 bg-secondary flex items-center justify-center">
                          <VideoOff className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Audio call */
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

              {/* Timer */}
              <div className="text-sm font-mono text-muted-foreground">
                {formatDuration(callDuration)}
              </div>

              {/* Controls */}
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

          {Array.from(remoteStreams.entries()).map(([participantId, stream], index) => {
            if (callType === "video" && index === 0) return null;

            return (
              <audio
                key={participantId}
                autoPlay
                playsInline
                className="hidden"
                ref={(node) => {
                  attachMediaStream(node, stream);
                }}
              />
            );
          })}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

export default CallOverlay;

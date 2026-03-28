import { motion, AnimatePresence } from "framer-motion";
import { Phone, PhoneOff, Video, Mic, MicOff, VideoOff, Maximize, Minimize, SwitchCamera } from "lucide-react";
import { useCall } from "@/contexts/CallContext";
import { useCallback, useEffect, useRef, useState } from "react";

const formatDuration = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const isMobileDevice = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

const CallOverlay = () => {
  const {
    callState, callType, participants, caller, callDuration,
    localStream, remoteStreams, isMuted, isCameraOff,
    acceptCall, rejectCall, endCall, toggleMute, toggleCamera, switchCamera,
  } = useCall();

  const [isFullscreen, setIsFullscreen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRefs = useRef<Map<string, HTMLVideoElement | null>>(new Map());

  const attachStream = (el: HTMLMediaElement | null, stream: MediaStream | null) => {
    if (!el) return;
    if (!stream) { el.srcObject = null; return; }
    if (el.srcObject !== stream) el.srcObject = stream;
    el.play().catch(() => {});
  };

  const setLocalVideoRef = useCallback((node: HTMLVideoElement | null) => {
    localVideoRef.current = node;
    attachStream(node, localStream);
  }, [localStream]);

  useEffect(() => {
    attachStream(localVideoRef.current, localStream);
  }, [localStream]);

  useEffect(() => {
    if (!localStream) return;
    const handler = () => attachStream(localVideoRef.current, localStream);
    localStream.addEventListener("addtrack", handler);
    localStream.addEventListener("removetrack", handler);
    return () => {
      localStream.removeEventListener("addtrack", handler);
      localStream.removeEventListener("removetrack", handler);
    };
  }, [localStream]);

  // Attach remote streams
  useEffect(() => {
    for (const [userId, stream] of remoteStreams) {
      const el = remoteVideoRefs.current.get(userId);
      if (el) attachStream(el, stream);
    }
  }, [remoteStreams]);

  // Fullscreen API
  const toggleFullscreen = useCallback(async () => {
    if (!overlayRef.current) return;
    try {
      if (!document.fullscreenElement) {
        await overlayRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  if (callState === "idle") return null;

  const targetName = callState === "incoming"
    ? caller?.name || "Неизвестный"
    : participants[0]?.name || "Неизвестный";
  const targetAvatar = callState === "incoming"
    ? caller?.avatarUrl
    : participants[0]?.avatarUrl;
  const initials = targetName.split(" ").map(n => n[0]).join("").slice(0, 2);

  const remoteEntries = Array.from(remoteStreams.entries());
  const gridCols = remoteEntries.length <= 1 ? 1 : remoteEntries.length <= 4 ? 2 : 3;

  return (
    <AnimatePresence>
      <motion.div
        ref={overlayRef}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-background/95 backdrop-blur-xl overflow-hidden"
        style={{ height: '100dvh' }}
      >
        <div
          className="relative z-10 flex flex-col items-center w-full h-full max-w-5xl mx-auto px-3 sm:px-4"
          style={{
            paddingTop: 'max(12px, env(safe-area-inset-top))',
            paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
          }}
        >
          {/* Incoming Call */}
          {callState === "incoming" && (
            <IncomingCallUI
              targetName={targetName}
              targetAvatar={targetAvatar}
              initials={initials}
              callType={callType}
              onAccept={acceptCall}
              onReject={rejectCall}
            />
          )}

          {/* Outgoing Call */}
          {callState === "outgoing" && (
            <OutgoingCallUI
              targetName={targetName}
              targetAvatar={targetAvatar}
              initials={initials}
              callType={callType}
              localStream={localStream}
              isCameraOff={isCameraOff}
              setLocalVideoRef={setLocalVideoRef}
              onEnd={endCall}
            />
          )}

          {/* Active Call */}
          {callState === "active" && (
            <div className="flex flex-col items-center w-full h-full gap-3">
              {callType === "video" ? (
                <div className="flex-1 w-full relative">
                  {/* Remote video grid */}
                  <div
                    className="w-full h-full gap-2"
                    style={{
                      display: "grid",
                      gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
                    }}
                  >
                    {remoteEntries.length > 0 ? (
                      remoteEntries.map(([userId, stream]) => (
                        <div key={userId} className="relative bg-secondary rounded-2xl overflow-hidden min-h-0">
                          <video
                            ref={(node) => {
                              remoteVideoRefs.current.set(userId, node);
                              attachStream(node, stream);
                            }}
                            autoPlay
                            playsInline
                            className="w-full h-full object-cover"
                          />
                          <ParticipantLabel userId={userId} />
                        </div>
                      ))
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary rounded-2xl">
                        <AvatarFallback avatar={targetAvatar} initials={initials} size="lg" />
                      </div>
                    )}
                  </div>

                  {/* Local video PiP */}
                  {localStream && (
                    <div className="absolute bottom-3 right-3 w-28 sm:w-36 aspect-video rounded-xl overflow-hidden border-2 border-border shadow-lg z-10">
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
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <AvatarFallback avatar={targetAvatar} initials={initials} size="lg" />
                  <h2 className="text-xl font-mono font-bold text-foreground">{targetName}</h2>
                  {participants.length > 1 && (
                    <p className="text-sm text-muted-foreground">
                      +{participants.length - 1} участник(ов)
                    </p>
                  )}
                </div>
              )}

              {/* Duration */}
              <div className="text-sm font-mono text-muted-foreground">
                {formatDuration(callDuration)}
              </div>

              {/* Controls */}
              <div className="flex gap-3 mt-1 pb-2">
                <ControlButton active={isMuted} onClick={toggleMute} variant="toggle">
                  {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </ControlButton>

                {callType === "video" && (
                  <>
                    <ControlButton active={isCameraOff} onClick={toggleCamera} variant="toggle">
                      {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
                    </ControlButton>

                    {isMobileDevice() && (
                      <ControlButton onClick={switchCamera} variant="default">
                        <SwitchCamera className="w-6 h-6" />
                      </ControlButton>
                    )}

                    <ControlButton onClick={toggleFullscreen} variant="default">
                      {isFullscreen ? <Minimize className="w-6 h-6" /> : <Maximize className="w-6 h-6" />}
                    </ControlButton>
                  </>
                )}

                <button
                  onClick={endCall}
                  className="w-14 h-14 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity"
                >
                  <PhoneOff className="w-6 h-6" />
                </button>
              </div>
            </div>
          )}

          {/* Hidden audio for all remote streams */}
          {Array.from(remoteStreams.entries()).map(([userId, stream]) => (
            <audio
              key={`audio-${userId}`}
              autoPlay
              playsInline
              className="hidden"
              ref={(node) => attachStream(node, stream)}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Sub-components ──

const AvatarFallback = ({ avatar, initials, size = "md" }: { avatar?: string | null; initials: string; size?: "md" | "lg" }) => {
  const sizeClass = size === "lg" ? "w-24 h-24" : "w-20 h-20";
  return (
    <div className={`${sizeClass} rounded-full bg-secondary flex items-center justify-center overflow-hidden`}>
      {avatar ? (
        <img src={avatar} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-2xl font-mono font-bold text-foreground">{initials}</span>
      )}
    </div>
  );
};

const ParticipantLabel = ({ userId }: { userId: string }) => (
  <div className="absolute bottom-2 left-2 bg-background/60 backdrop-blur-sm rounded px-2 py-0.5 text-xs text-foreground font-mono truncate max-w-[80%]">
    {userId.slice(0, 8)}
  </div>
);

const ControlButton = ({
  children, onClick, active, variant = "default",
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  variant?: "default" | "toggle";
}) => (
  <button
    onClick={onClick}
    className={`w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
      variant === "toggle" && active
        ? "bg-destructive/20 text-destructive"
        : "bg-secondary text-foreground hover:bg-secondary/80"
    }`}
  >
    {children}
  </button>
);

const IncomingCallUI = ({
  targetName, targetAvatar, initials, callType, onAccept, onReject,
}: {
  targetName: string; targetAvatar?: string | null; initials: string;
  callType: string; onAccept: () => void; onReject: () => void;
}) => (
  <motion.div
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="flex flex-col items-center justify-center h-full gap-6"
  >
    <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 2 }}>
      <AvatarFallback avatar={targetAvatar} initials={initials} size="lg" />
    </motion.div>
    <div className="text-center">
      <h2 className="text-xl font-mono font-bold text-foreground">{targetName}</h2>
      <p className="text-sm text-muted-foreground mt-1">
        Входящий {callType === "video" ? "видео" : "аудио"}звонок...
      </p>
    </div>
    <div className="flex gap-6 mt-4">
      <button onClick={onReject} className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity">
        <PhoneOff className="w-7 h-7" />
      </button>
      <button onClick={onAccept} className="w-16 h-16 rounded-full bg-[hsl(var(--terminal-green))] text-white flex items-center justify-center hover:opacity-90 transition-opacity">
        <Phone className="w-7 h-7" />
      </button>
    </div>
  </motion.div>
);

const OutgoingCallUI = ({
  targetName, targetAvatar, initials, callType, localStream, isCameraOff, setLocalVideoRef, onEnd,
}: {
  targetName: string; targetAvatar?: string | null; initials: string;
  callType: string; localStream: MediaStream | null; isCameraOff: boolean;
  setLocalVideoRef: (node: HTMLVideoElement | null) => void; onEnd: () => void;
}) => (
  <motion.div
    initial={{ scale: 0.9, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    className="flex flex-col items-center justify-center h-full gap-6"
  >
    <motion.div animate={{ scale: [1, 1.05, 1] }} transition={{ repeat: Infinity, duration: 1.5 }}>
      <AvatarFallback avatar={targetAvatar} initials={initials} size="lg" />
    </motion.div>
    <div className="text-center">
      <h2 className="text-xl font-mono font-bold text-foreground">{targetName}</h2>
      <p className="text-sm text-muted-foreground mt-1">Ожидание ответа...</p>
      <motion.div className="flex justify-center gap-1 mt-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
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
    <button onClick={onEnd} className="w-16 h-16 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center hover:opacity-90 transition-opacity mt-4">
      <PhoneOff className="w-7 h-7" />
    </button>
  </motion.div>
);

export default CallOverlay;

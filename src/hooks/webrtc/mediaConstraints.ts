const VIDEO_IDEAL: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 1280, max: 1920 },
  height: { ideal: 720, max: 1080 },
  frameRate: { ideal: 30, max: 30 },
};

const VIDEO_FALLBACK: MediaTrackConstraints = {
  facingMode: "user",
  width: { ideal: 640 },
  height: { ideal: 480 },
  frameRate: { ideal: 24, max: 30 },
};

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

export type MediaAcquireResult = {
  stream: MediaStream;
  videoDowngraded: boolean;
};

export const acquireMedia = async (
  wantVideo: boolean,
  log: (event: string, details?: Record<string, any>) => void,
  facingMode?: "user" | "environment",
): Promise<MediaAcquireResult> => {
  const videoConstraints = wantVideo
    ? { ...VIDEO_IDEAL, ...(facingMode ? { facingMode } : {}) }
    : false;

  const constraints: MediaStreamConstraints = {
    audio: AUDIO_CONSTRAINTS,
    video: videoConstraints,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    log("media_acquired", {
      tracks: stream.getTracks().map(t => `${t.kind}:${t.readyState}`),
      videoDowngraded: false,
    });
    return { stream, videoDowngraded: false };
  } catch (err: any) {
    if (wantVideo && err.name !== "NotAllowedError") {
      log("media_fallback_attempting", { error: err.name });

      const fallbackVideo = { ...VIDEO_FALLBACK, ...(facingMode ? { facingMode } : {}) };

      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: AUDIO_CONSTRAINTS,
          video: fallbackVideo,
        });
        log("media_acquired_fallback", {
          tracks: fallbackStream.getTracks().map(t => `${t.kind}:${t.readyState}`),
          videoDowngraded: true,
        });
        return { stream: fallbackStream, videoDowngraded: true };
      } catch (fallbackErr: any) {
        if (fallbackErr.name !== "NotAllowedError") {
          log("media_fallback_audio_only", { error: fallbackErr.name });
          try {
            const audioOnlyStream = await navigator.mediaDevices.getUserMedia({
              audio: AUDIO_CONSTRAINTS,
              video: false,
            });
            log("media_acquired_audio_only", {
              tracks: audioOnlyStream.getTracks().map(t => `${t.kind}:${t.readyState}`),
            });
            return { stream: audioOnlyStream, videoDowngraded: true };
          } catch {
            // fall through
          }
        }
      }
    }

    log("media_error", { name: err.name, message: err.message });
    throw new Error(err.name === "NotAllowedError" ? "no_permission" : "media_error");
  }
};

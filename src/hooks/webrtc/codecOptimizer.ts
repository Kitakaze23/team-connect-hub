/**
 * Codec preference optimizer.
 *
 * Prefers H.264 (hardware-accelerated on most devices) over VP8/VP9
 * for video, and Opus for audio.
 */

export const applyCodecPreferences = (
  pc: RTCPeerConnection,
  log: (event: string, details?: Record<string, any>) => void,
): void => {
  // setCodecPreferences is only available on transceivers
  if (!pc.getTransceivers) return;

  try {
    for (const transceiver of pc.getTransceivers()) {
      if (!transceiver.setCodecPreferences) continue;

      const { receiver } = transceiver;
      const kind = receiver.track?.kind || transceiver.mid;

      if (!kind) continue;

      // Get supported codecs
      const capabilities =
        RTCRtpReceiver.getCapabilities?.(kind === "audio" ? "audio" : "video");
      if (!capabilities?.codecs) continue;

      if (kind === "video" || transceiver.mid === "1") {
        // Prefer H.264 > VP8 > VP9 > others
        const sorted = [...capabilities.codecs].sort((a, b) => {
          const priority = (codec: { mimeType: string }) => {
            const mime = codec.mimeType.toLowerCase();
            if (mime.includes("h264")) return 0;
            if (mime.includes("vp8")) return 1;
            if (mime.includes("vp9")) return 2;
            if (mime.includes("av1")) return 3;
            return 10; // RTX, RED, etc.
          };
          return priority(a) - priority(b);
        });

        try {
          transceiver.setCodecPreferences(sorted);
          log("codec_preferences_set", {
            kind: "video",
            preferred: sorted[0]?.mimeType,
          });
        } catch (e: any) {
          log("codec_preferences_error", { kind: "video", error: e?.message });
        }
      }

      if (kind === "audio" || transceiver.mid === "0") {
        // Prefer Opus
        const sorted = [...capabilities.codecs].sort((a, b) => {
          const isOpus = (c: { mimeType: string }) =>
            c.mimeType.toLowerCase().includes("opus") ? 0 : 1;
          return isOpus(a) - isOpus(b);
        });

        try {
          transceiver.setCodecPreferences(sorted);
          log("codec_preferences_set", {
            kind: "audio",
            preferred: sorted[0]?.mimeType,
          });
        } catch {
          // Non-critical
        }
      }
    }
  } catch (e: any) {
    log("codec_optimizer_error", { error: e?.message });
  }
};

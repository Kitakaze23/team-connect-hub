/**
 * Codec preference optimizer.
 *
 * Prefers H.264 (hardware-accelerated on most devices) over VP8/VP9
 * for video, and Opus for audio.
 *
 * Safe to call before or after tracks are attached — it operates
 * on transceivers present at call time.
 */

export const applyCodecPreferences = (
  pc: RTCPeerConnection,
  log: (event: string, details?: Record<string, any>) => void,
): void => {
  if (!pc.getTransceivers) return;

  try {
    for (const transceiver of pc.getTransceivers()) {
      if (!transceiver.setCodecPreferences) continue;

      const kind = transceiver.receiver?.track?.kind
        || (transceiver.sender?.track?.kind)
        || inferKindFromMid(transceiver.mid);

      if (!kind) continue;

      const capabilities = RTCRtpReceiver.getCapabilities?.(kind);
      if (!capabilities?.codecs) continue;

      if (kind === "video") {
        // Prefer H.264 > VP8 > VP9 > AV1 > others
        const sorted = [...capabilities.codecs].sort((a, b) => {
          return codecPriority(a.mimeType) - codecPriority(b.mimeType);
        });

        try {
          transceiver.setCodecPreferences(sorted);
          log("codec_preferences_set", { kind: "video", preferred: sorted[0]?.mimeType });
        } catch (e: any) {
          log("codec_preferences_error", { kind: "video", error: e?.message });
        }
      }

      if (kind === "audio") {
        // Prefer Opus
        const sorted = [...capabilities.codecs].sort((a, b) => {
          const isOpus = (c: { mimeType: string }) =>
            c.mimeType.toLowerCase().includes("opus") ? 0 : 1;
          return isOpus(a) - isOpus(b);
        });

        try {
          transceiver.setCodecPreferences(sorted);
          log("codec_preferences_set", { kind: "audio", preferred: sorted[0]?.mimeType });
        } catch {
          // Non-critical
        }
      }
    }
  } catch (e: any) {
    log("codec_optimizer_error", { error: e?.message });
  }
};

function codecPriority(mimeType: string): number {
  const mime = mimeType.toLowerCase();
  if (mime.includes("h264")) return 0;
  if (mime.includes("vp8")) return 1;
  if (mime.includes("vp9")) return 2;
  if (mime.includes("av1")) return 3;
  return 10; // RTX, RED, etc.
}

function inferKindFromMid(mid: string | null): "audio" | "video" | null {
  if (mid === "0") return "audio";
  if (mid === "1") return "video";
  return null;
}

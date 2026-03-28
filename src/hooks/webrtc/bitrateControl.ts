/**
 * Adaptive bitrate control for WebRTC senders.
 *
 * Adjusts maxBitrate based on network quality classification.
 */

export type NetworkQuality = "good" | "medium" | "poor" | "unknown";

interface BitrateProfile {
  videoBitrate: number; // bps
  audioBitrate: number; // bps
}

const BITRATE_PROFILES: Record<NetworkQuality, BitrateProfile> = {
  good:    { videoBitrate: 2_500_000, audioBitrate: 64_000 },
  medium:  { videoBitrate: 1_000_000, audioBitrate: 48_000 },
  poor:    { videoBitrate: 400_000,   audioBitrate: 32_000 },
  unknown: { videoBitrate: 1_500_000, audioBitrate: 48_000 },
};

/**
 * Apply bitrate limits to all senders on a PeerConnection.
 */
export const applyBitrateLimit = async (
  pc: RTCPeerConnection,
  quality: NetworkQuality,
  log: (event: string, details?: Record<string, any>) => void,
): Promise<void> => {
  const profile = BITRATE_PROFILES[quality];

  for (const sender of pc.getSenders()) {
    if (!sender.track) continue;

    const params = sender.getParameters();
    if (!params.encodings || params.encodings.length === 0) {
      params.encodings = [{}];
    }

    const targetBitrate = sender.track.kind === "video"
      ? profile.videoBitrate
      : profile.audioBitrate;

    let changed = false;
    for (const encoding of params.encodings) {
      if (encoding.maxBitrate !== targetBitrate) {
        encoding.maxBitrate = targetBitrate;
        changed = true;
      }
    }

    if (changed) {
      try {
        await sender.setParameters(params);
        log("bitrate_applied", {
          kind: sender.track.kind,
          quality,
          maxBitrate: targetBitrate,
        });
      } catch (e: any) {
        log("bitrate_apply_error", {
          kind: sender.track.kind,
          error: e?.message,
        });
      }
    }
  }
};

/**
 * Configure simulcast encodings on a video transceiver (if supported).
 */
export const configureSimulcast = (
  pc: RTCPeerConnection,
  log: (event: string, details?: Record<string, any>) => void,
): void => {
  try {
    const videoSender = pc.getSenders().find(s => s.track?.kind === "video");
    if (!videoSender) return;

    const params = videoSender.getParameters();
    if (!params.encodings || params.encodings.length === 0) return;

    // Only apply simulcast if browser supports multiple encodings
    // For single-encoding case, just set reasonable defaults
    if (params.encodings.length === 1) {
      params.encodings[0].maxBitrate = 1_500_000;
      params.encodings[0].scaleResolutionDownBy = 1;
    }

    videoSender.setParameters(params).catch((e: any) => {
      log("simulcast_config_error", { error: e?.message });
    });

    log("simulcast_configured", { encodings: params.encodings.length });
  } catch (e: any) {
    log("simulcast_setup_error", { error: e?.message });
  }
};

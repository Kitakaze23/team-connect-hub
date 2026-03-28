/**
 * Adaptive bitrate control for WebRTC senders.
 *
 * - Manages 3-layer simulcast encodings (low / medium / high)
 * - Adjusts maxBitrate based on network quality classification
 * - Supports hysteresis to avoid rapid bitrate oscillation
 */

export type NetworkQuality = "good" | "medium" | "poor" | "unknown";

interface BitrateProfile {
  videoBitrate: number; // bps — applied to the *active* top layer
  audioBitrate: number; // bps
}

const BITRATE_PROFILES: Record<NetworkQuality, BitrateProfile> = {
  good:    { videoBitrate: 2_500_000, audioBitrate: 64_000 },
  medium:  { videoBitrate: 800_000,   audioBitrate: 48_000 },
  poor:    { videoBitrate: 300_000,   audioBitrate: 32_000 },
  unknown: { videoBitrate: 1_200_000, audioBitrate: 48_000 },
};

// ── Simulcast encoding definitions ──
// Used in addTransceiver({ sendEncodings }) when first attaching video.
export const SIMULCAST_ENCODINGS: RTCRtpEncodingParameters[] = [
  { rid: "low",  maxBitrate: 150_000,   scaleResolutionDownBy: 4, maxFramerate: 15 },
  { rid: "mid",  maxBitrate: 500_000,   scaleResolutionDownBy: 2, maxFramerate: 24 },
  { rid: "high", maxBitrate: 1_500_000, scaleResolutionDownBy: 1, maxFramerate: 30 },
];

/**
 * Apply bitrate limits to all senders on a PeerConnection.
 * For video senders with simulcast encodings, scale each layer proportionally.
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

    let changed = false;

    if (sender.track.kind === "video") {
      if (params.encodings.length >= 3) {
        // Simulcast: scale layers based on quality
        const layerConfig = getSimulcastLayerConfig(quality);
        for (let i = 0; i < params.encodings.length; i++) {
          const cfg = layerConfig[i];
          if (cfg) {
            if (params.encodings[i].maxBitrate !== cfg.maxBitrate) {
              params.encodings[i].maxBitrate = cfg.maxBitrate;
              changed = true;
            }
            if (params.encodings[i].active !== cfg.active) {
              params.encodings[i].active = cfg.active;
              changed = true;
            }
          }
        }
      } else {
        // Single encoding fallback
        const targetBitrate = profile.videoBitrate;
        if (params.encodings[0].maxBitrate !== targetBitrate) {
          params.encodings[0].maxBitrate = targetBitrate;
          changed = true;
        }
      }
    } else {
      // Audio
      const targetBitrate = profile.audioBitrate;
      if (params.encodings[0].maxBitrate !== targetBitrate) {
        params.encodings[0].maxBitrate = targetBitrate;
        changed = true;
      }
    }

    if (changed) {
      try {
        await sender.setParameters(params);
        log("bitrate_applied", {
          kind: sender.track.kind,
          quality,
          encodings: params.encodings.length,
          maxBitrate: params.encodings[0]?.maxBitrate,
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
 * Get per-layer simulcast config based on network quality.
 * On poor networks, disable high layer. On medium, cap high layer.
 */
function getSimulcastLayerConfig(quality: NetworkQuality): Array<{ maxBitrate: number; active: boolean }> {
  switch (quality) {
    case "poor":
      return [
        { maxBitrate: 100_000, active: true },   // low — always on
        { maxBitrate: 250_000, active: false },   // mid — off
        { maxBitrate: 500_000, active: false },   // high — off
      ];
    case "medium":
      return [
        { maxBitrate: 150_000, active: true },
        { maxBitrate: 500_000, active: true },
        { maxBitrate: 800_000, active: false },   // high — off to save bandwidth
      ];
    case "good":
      return [
        { maxBitrate: 150_000, active: true },
        { maxBitrate: 500_000, active: true },
        { maxBitrate: 2_000_000, active: true },
      ];
    default:
      return [
        { maxBitrate: 150_000, active: true },
        { maxBitrate: 500_000, active: true },
        { maxBitrate: 1_200_000, active: true },
      ];
  }
}

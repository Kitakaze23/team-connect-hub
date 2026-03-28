/**
 * WebRTC stats monitoring and network quality classification.
 *
 * Uses pc.getStats() to track packet loss, jitter, RTT, and bitrate.
 * Classifies network as good / medium / poor.
 */

import type { NetworkQuality } from "./bitrateControl";

export interface NetworkStats {
  quality: NetworkQuality;
  rtt: number;           // ms
  jitter: number;        // ms
  packetLoss: number;    // percentage 0-100
  bitrateSend: number;   // bps
  bitrateRecv: number;   // bps
  localCandidateType: string;
  remoteCandidateType: string;
  timestamp: number;
}

interface PrevStats {
  bytesSent: number;
  bytesRecv: number;
  packetsSent: number;
  packetsLost: number;
  timestamp: number;
}

const prevStatsMap = new Map<string, PrevStats>();

export const clearStatsFor = (peerId: string) => {
  prevStatsMap.delete(peerId);
};

/**
 * Collect stats from a PeerConnection and classify network quality.
 */
export const collectStats = async (
  peerId: string,
  pc: RTCPeerConnection,
): Promise<NetworkStats | null> => {
  if (pc.connectionState === "closed") return null;

  try {
    const stats = await pc.getStats();
    let rtt = 0;
    let jitter = 0;
    let bytesSent = 0;
    let bytesRecv = 0;
    let packetsSent = 0;
    let packetsLost = 0;
    let localCandidateType = "unknown";
    let remoteCandidateType = "unknown";
    let selectedPairId: string | null = null;

    // Find selected candidate pair
    stats.forEach((report: any) => {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        selectedPairId = report.selectedCandidatePairId;
      }
    });

    stats.forEach((report: any) => {
      if (report.type === "candidate-pair") {
        const isSelected = report.id === selectedPairId ||
          report.selected || report.nominated || report.state === "succeeded";
        if (isSelected) {
          rtt = (report.currentRoundTripTime ?? 0) * 1000; // s → ms
          if (report.localCandidateId) {
            const lc = stats.get(report.localCandidateId);
            if (lc) localCandidateType = lc.candidateType ?? "unknown";
          }
          if (report.remoteCandidateId) {
            const rc = stats.get(report.remoteCandidateId);
            if (rc) remoteCandidateType = rc.candidateType ?? "unknown";
          }
        }
      }

      if (report.type === "outbound-rtp" && report.kind === "video") {
        bytesSent += report.bytesSent ?? 0;
        packetsSent += report.packetsSent ?? 0;
      }

      if (report.type === "inbound-rtp" && report.kind === "video") {
        bytesRecv += report.bytesReceived ?? 0;
        packetsLost += report.packetsLost ?? 0;
        jitter = Math.max(jitter, (report.jitter ?? 0) * 1000);
      }

      if (report.type === "inbound-rtp" && report.kind === "audio") {
        packetsLost += report.packetsLost ?? 0;
        jitter = Math.max(jitter, (report.jitter ?? 0) * 1000);
      }
    });

    const now = Date.now();
    const prev = prevStatsMap.get(peerId);

    let bitrateSend = 0;
    let bitrateRecv = 0;
    let packetLoss = 0;

    if (prev) {
      const dt = (now - prev.timestamp) / 1000;
      if (dt > 0) {
        bitrateSend = Math.max(0, ((bytesSent - prev.bytesSent) * 8) / dt);
        bitrateRecv = Math.max(0, ((bytesRecv - prev.bytesRecv) * 8) / dt);
        const totalNewPackets = packetsSent - prev.packetsSent;
        const totalNewLost = packetsLost - prev.packetsLost;
        if (totalNewPackets > 0) {
          packetLoss = Math.max(0, Math.min(100, (totalNewLost / totalNewPackets) * 100));
        }
      }
    }

    prevStatsMap.set(peerId, {
      bytesSent, bytesRecv, packetsSent, packetsLost, timestamp: now,
    });

    const quality = classifyQuality(rtt, jitter, packetLoss);

    return {
      quality, rtt, jitter, packetLoss,
      bitrateSend, bitrateRecv,
      localCandidateType, remoteCandidateType,
      timestamp: now,
    };
  } catch {
    return null;
  }
};

/**
 * Classify quality based on key metrics.
 */
const classifyQuality = (rttMs: number, jitterMs: number, lossPercent: number): NetworkQuality => {
  // Poor: high RTT or packet loss
  if (rttMs > 400 || lossPercent > 10 || jitterMs > 100) return "poor";
  // Medium: moderate issues
  if (rttMs > 150 || lossPercent > 3 || jitterMs > 50) return "medium";
  // Good
  return "good";
};

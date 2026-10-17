/**
 * STATIC — WebRTC Diagnostics & Adaptive Quality Controller
 * 
 * Periodically queries RTCPeerConnection.getStats() for all active party peers.
 * Evaluates real-time connection health and drives the adaptive quality loop:
 * - Computes RTT, Jitter, Loss %, and Outgoing Bitrates every 2 seconds.
 * - Hysteresis: Requires 3 consecutive samples before changing adaptive tiers.
 * - Rate-limits changes to prevent oscillating bitrate churn.
 * - Sets adaptive target bitrates (24–64 kbps) and jitterBufferTarget (20–120ms).
 */

export type ConnectionQuality = 'EXCELLENT' | 'GOOD' | 'UNSTABLE' | 'POOR';
export type AdaptiveQualityTier = 'GOOD' | 'FAIR' | 'POOR' | 'CRITICAL';

export interface PeerConnectionStats {
  peerId: string; // participantId or socketId
  remoteSocketId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  quality: ConnectionQuality;
  adaptiveTier: AdaptiveQualityTier;
  targetBitrateKbps: number;
  recommendedJitterBufferMs: number;
  roundTripTimeMs: number;
  jitterMs: number;
  packetsLost: number;
  packetsReceived: number;
  packetLossPercent: number;
  inboundBitrateKbps: number;
  outboundBitrateKbps: number;
  codec: string;
  audioTrackState: string;
  concealedSamples?: number;
  lastUpdated: number;
}

interface PeerHistory {
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsLost: number;
  timestamp: number;
}

interface AdaptivePeerState {
  currentTier: AdaptiveQualityTier;
  candidateTier: AdaptiveQualityTier;
  consecutiveCandidateCount: number;
  lastTierChangeTime: number;
  targetBitrateBps: number;
}

export interface DiagnosticsCallbacks {
  onStatsUpdated?: (stats: Map<string, PeerConnectionStats>) => void;
  onQualityChanged?: (peerId: string, quality: ConnectionQuality) => void;
  onAdaptiveTierChanged?: (
    peerId: string,
    tier: AdaptiveQualityTier,
    targetBitrateBps: number,
    recommendedJitterBufferMs: number
  ) => void;
}

export class WebRTCDiagnostics {
  private peerHistories: Map<string, PeerHistory> = new Map();
  private latestStats: Map<string, PeerConnectionStats> = new Map();
  private prevQualities: Map<string, ConnectionQuality> = new Map();
  private adaptiveStates: Map<string, AdaptivePeerState> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private callbacks: DiagnosticsCallbacks;

  constructor(callbacks: DiagnosticsCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Starts periodic polling of getStats() (Default 2000ms as per Phase 1 spec)
   */
  public start(
    getPeers: () => Array<{ id: string; socketId: string; pc: RTCPeerConnection }>,
    intervalMs: number = 2000
  ) {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }

    const poll = async () => {
      const peers = getPeers();
      if (!peers || peers.length === 0) {
        if (this.latestStats.size > 0) {
          this.latestStats.clear();
          this.callbacks.onStatsUpdated?.(new Map());
        }
        return;
      }

      const updatedMap = new Map<string, PeerConnectionStats>();

      for (const { id, socketId, pc } of peers) {
        if (!pc || pc.connectionState === 'closed') continue;

        try {
          const stats = await this.extractStatsForPeer(id, socketId, pc);
          updatedMap.set(id, stats);
          this.latestStats.set(id, stats);

          // Notify on quality transition
          const prevQ = this.prevQualities.get(id);
          if (prevQ !== stats.quality) {
            this.prevQualities.set(id, stats.quality);
            this.callbacks.onQualityChanged?.(id, stats.quality);
          }
        } catch (_) {}
      }

      this.callbacks.onStatsUpdated?.(new Map(this.latestStats));
    };

    // Initial check
    poll();
    this.intervalId = setInterval(poll, intervalMs);
  }

  /**
   * Extracts and computes metrics from RTCPeerConnection.getStats()
   */
  private async extractStatsForPeer(
    peerId: string,
    socketId: string,
    pc: RTCPeerConnection
  ): Promise<PeerConnectionStats> {
    const report = await pc.getStats();
    const now = Date.now();

    let roundTripTimeMs = 0;
    let jitterMs = 0;
    let totalPacketsLost = 0;
    let totalPacketsReceived = 0;
    let totalBytesReceived = 0;
    let totalBytesSent = 0;
    let codecString = 'Opus 48kHz';
    let concealedSamples: number | undefined = undefined;
    let audioTrackState = 'live';

    // Map of codecId -> mimeType
    const codecMap = new Map<string, string>();
    report.forEach((stat) => {
      if (stat.type === 'codec') {
        const mime = stat.mimeType
          ? `${stat.mimeType} ${stat.clockRate ? stat.clockRate + 'Hz' : ''}`.trim()
          : stat.name;
        if (mime) codecMap.set(stat.id, mime);
      }
    });

    report.forEach((stat) => {
      // 1. Candidate pair for RTT
      if (stat.type === 'candidate-pair' && (stat.nominated || stat.state === 'succeeded')) {
        if (typeof stat.currentRoundTripTime === 'number') {
          roundTripTimeMs = Math.round(stat.currentRoundTripTime * 1000);
        } else if (
          typeof stat.totalRoundTripTime === 'number' &&
          typeof stat.responsesReceived === 'number' &&
          stat.responsesReceived > 0
        ) {
          roundTripTimeMs = Math.round((stat.totalRoundTripTime / stat.responsesReceived) * 1000);
        }
      }

      // 2. Inbound RTP for audio
      if (stat.type === 'inbound-rtp' && (stat.kind === 'audio' || stat.mediaType === 'audio')) {
        if (typeof stat.jitter === 'number') {
          jitterMs = Math.round(stat.jitter * 1000);
        }
        if (typeof stat.packetsLost === 'number') {
          totalPacketsLost = stat.packetsLost;
        }
        if (typeof stat.packetsReceived === 'number') {
          totalPacketsReceived = stat.packetsReceived;
        }
        if (typeof stat.bytesReceived === 'number') {
          totalBytesReceived = stat.bytesReceived;
        }
        if (typeof stat.concealedSamples === 'number') {
          concealedSamples = stat.concealedSamples;
        }
        if (stat.codecId && codecMap.has(stat.codecId)) {
          codecString = codecMap.get(stat.codecId)!;
        }
      }

      // 3. Outbound RTP for audio
      if (stat.type === 'outbound-rtp' && (stat.kind === 'audio' || stat.mediaType === 'audio')) {
        if (typeof stat.bytesSent === 'number') {
          totalBytesSent = stat.bytesSent;
        }
      }

      // 4. Remote track state
      if (stat.type === 'track' && stat.kind === 'audio') {
        if (stat.readyState) audioTrackState = stat.readyState;
      }
    });

    // Compute delta bitrates and delta loss rate
    const history = this.peerHistories.get(peerId);
    let inboundBitrateKbps = 0;
    let outboundBitrateKbps = 0;
    let packetLossPercent = 0;

    if (history) {
      const deltaMs = Math.max(1, now - history.timestamp);
      const deltaBytesIn = Math.max(0, totalBytesReceived - history.bytesReceived);
      const deltaBytesOut = Math.max(0, totalBytesSent - history.bytesSent);
      const deltaPacketsIn = Math.max(0, totalPacketsReceived - history.packetsReceived);
      const deltaPacketsLost = Math.max(0, totalPacketsLost - history.packetsLost);

      inboundBitrateKbps = Math.round((deltaBytesIn * 8) / deltaMs);
      outboundBitrateKbps = Math.round((deltaBytesOut * 8) / deltaMs);

      const totalExpected = deltaPacketsIn + deltaPacketsLost;
      if (totalExpected > 0) {
        packetLossPercent = Math.round((deltaPacketsLost / totalExpected) * 100);
      }
    } else {
      if (totalPacketsReceived + totalPacketsLost > 0) {
        packetLossPercent = Math.round((totalPacketsLost / (totalPacketsReceived + totalPacketsLost)) * 100);
      }
    }

    // Save history
    this.peerHistories.set(peerId, {
      bytesReceived: totalBytesReceived,
      bytesSent: totalBytesSent,
      packetsReceived: totalPacketsReceived,
      packetsLost: totalPacketsLost,
      timestamp: now
    });

    // Evaluate Quality & Adaptive Quality Tier
    const quality = this.determineQuality(
      pc.connectionState,
      pc.iceConnectionState,
      roundTripTimeMs,
      jitterMs,
      packetLossPercent
    );

    const { adaptiveTier, targetBitrateBps, recommendedJitterBufferMs } = this.processAdaptiveController(
      peerId,
      roundTripTimeMs,
      jitterMs,
      packetLossPercent,
      pc.connectionState
    );

    return {
      peerId,
      remoteSocketId: socketId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      quality,
      adaptiveTier,
      targetBitrateKbps: Math.round(targetBitrateBps / 1000),
      recommendedJitterBufferMs,
      roundTripTimeMs,
      jitterMs,
      packetsLost: totalPacketsLost,
      packetsReceived: totalPacketsReceived,
      packetLossPercent,
      inboundBitrateKbps,
      outboundBitrateKbps,
      codec: codecString,
      audioTrackState,
      concealedSamples,
      lastUpdated: now
    };
  }

  /**
   * Adaptive Quality Controller with Hysteresis & Rate-Limiting
   * - Requires 3 consecutive samples in candidate tier before transition.
   * - Rate-limits changes to at least 4s between shifts (unless catastrophic loss > 15%).
   */
  private processAdaptiveController(
    peerId: string,
    rtt: number,
    jitter: number,
    lossPercent: number,
    connState: RTCPeerConnectionState
  ): { adaptiveTier: AdaptiveQualityTier; targetBitrateBps: number; recommendedJitterBufferMs: number } {
    let measuredTier: AdaptiveQualityTier = 'GOOD';

    if (connState === 'disconnected' || connState === 'failed' || lossPercent >= 10 || rtt > 350) {
      measuredTier = 'CRITICAL';
    } else if (lossPercent >= 5 || rtt > 250 || jitter > 60) {
      measuredTier = 'POOR';
    } else if (lossPercent >= 2 || rtt > 160 || jitter > 35) {
      measuredTier = 'FAIR';
    } else {
      measuredTier = 'GOOD';
    }

    const now = Date.now();
    let state = this.adaptiveStates.get(peerId);
    if (!state) {
      state = {
        currentTier: measuredTier,
        candidateTier: measuredTier,
        consecutiveCandidateCount: 0,
        lastTierChangeTime: now,
        targetBitrateBps: this.getTargetBitrateForTier(measuredTier)
      };
      this.adaptiveStates.set(peerId, state);
    }

    // Check candidate tier consistency (Hysteresis = 3 samples)
    if (measuredTier === state.candidateTier) {
      state.consecutiveCandidateCount++;
    } else {
      state.candidateTier = measuredTier;
      state.consecutiveCandidateCount = 1;
    }

    const timeSinceLastChange = now - state.lastTierChangeTime;
    const isCatastrophic = measuredTier === 'CRITICAL' && lossPercent >= 15;
    const meetsHysteresis = state.consecutiveCandidateCount >= 3;
    const meetsRateLimit = timeSinceLastChange >= 4000;

    if (state.candidateTier !== state.currentTier && (isCatastrophic || (meetsHysteresis && meetsRateLimit))) {
      state.currentTier = state.candidateTier;
      state.lastTierChangeTime = now;
      state.targetBitrateBps = this.getTargetBitrateForTier(state.currentTier);

      const jitterBufferMs = this.getJitterBufferTargetForTier(state.currentTier);
      this.callbacks.onAdaptiveTierChanged?.(peerId, state.currentTier, state.targetBitrateBps, jitterBufferMs);
    }

    return {
      adaptiveTier: state.currentTier,
      targetBitrateBps: state.targetBitrateBps,
      recommendedJitterBufferMs: this.getJitterBufferTargetForTier(state.currentTier)
    };
  }

  private getTargetBitrateForTier(tier: AdaptiveQualityTier): number {
    switch (tier) {
      case 'GOOD':
        return 52000; // 52 kbps (range 48-64k)
      case 'FAIR':
        return 40000; // 40 kbps
      case 'POOR':
        return 28000; // 28 kbps (range 24-32k)
      case 'CRITICAL':
        return 24000; // 24 kbps
    }
  }

  private getJitterBufferTargetForTier(tier: AdaptiveQualityTier): number {
    switch (tier) {
      case 'GOOD':
        return 30; // 30ms playout delay
      case 'FAIR':
        return 50; // 50ms playout delay
      case 'POOR':
        return 80; // 80ms playout delay
      case 'CRITICAL':
        return 120; // 120ms playout delay
    }
  }

  private determineQuality(
    connState: RTCPeerConnectionState,
    iceState: RTCIceConnectionState,
    rtt: number,
    jitter: number,
    lossPercent: number
  ): ConnectionQuality {
    if (connState === 'failed' || iceState === 'failed' || connState === 'disconnected' || lossPercent >= 15) {
      return 'POOR';
    }

    if (rtt > 350 || jitter > 80 || lossPercent >= 8) {
      return 'UNSTABLE';
    }

    if (rtt > 180 || jitter > 40 || lossPercent >= 3) {
      return 'GOOD';
    }

    return 'EXCELLENT';
  }

  public getStatsForPeer(peerId: string): PeerConnectionStats | undefined {
    return this.latestStats.get(peerId);
  }

  public getAllStats(): Map<string, PeerConnectionStats> {
    return new Map(this.latestStats);
  }

  public removePeer(peerId: string) {
    this.peerHistories.delete(peerId);
    this.latestStats.delete(peerId);
    this.prevQualities.delete(peerId);
    this.adaptiveStates.delete(peerId);
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.peerHistories.clear();
    this.latestStats.clear();
    this.prevQualities.clear();
    this.adaptiveStates.clear();
  }
}

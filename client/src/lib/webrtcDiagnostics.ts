/**
 * STATIC — WebRTC Diagnostics & Quality Monitor
 * 
 * Periodically queries RTCPeerConnection.getStats() for all active party peers.
 * Analyzes RTT, Jitter, Packet Loss, Bitrates, Codec, and ICE states to evaluate
 * real-time connection health (EXCELLENT, GOOD, UNSTABLE, POOR).
 */

export type ConnectionQuality = 'EXCELLENT' | 'GOOD' | 'UNSTABLE' | 'POOR';

export interface PeerConnectionStats {
  peerId: string; // participantId or socketId
  remoteSocketId: string;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
  quality: ConnectionQuality;
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

export interface DiagnosticsCallbacks {
  onStatsUpdated?: (stats: Map<string, PeerConnectionStats>) => void;
  onQualityChanged?: (peerId: string, quality: ConnectionQuality) => void;
}

export class WebRTCDiagnostics {
  private peerHistories: Map<string, PeerHistory> = new Map();
  private latestStats: Map<string, PeerConnectionStats> = new Map();
  private prevQualities: Map<string, ConnectionQuality> = new Map();
  private intervalId: NodeJS.Timeout | null = null;
  private callbacks: DiagnosticsCallbacks;

  constructor(callbacks: DiagnosticsCallbacks = {}) {
    this.callbacks = callbacks;
  }

  /**
   * Starts periodic polling of getStats()
   */
  public start(getPeers: () => Array<{ id: string; socketId: string; pc: RTCPeerConnection }>, intervalMs: number = 2500) {
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
        const mime = stat.mimeType ? `${stat.mimeType} ${stat.clockRate ? stat.clockRate + 'Hz' : ''}`.trim() : stat.name;
        if (mime) codecMap.set(stat.id, mime);
      }
    });

    report.forEach((stat) => {
      // 1. Candidate pair for RTT
      if (stat.type === 'candidate-pair' && (stat.nominated || stat.state === 'succeeded')) {
        if (typeof stat.currentRoundTripTime === 'number') {
          roundTripTimeMs = Math.round(stat.currentRoundTripTime * 1000);
        } else if (typeof stat.totalRoundTripTime === 'number' && typeof stat.responsesReceived === 'number' && stat.responsesReceived > 0) {
          roundTripTimeMs = Math.round((stat.totalRoundTripTime / stat.responsesReceived) * 1000);
        }
      }

      // 2. Inbound RTP for audio (inbound bitrate, packet loss, jitter, codec, concealed samples)
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

      // 3. Outbound RTP for audio (outbound bitrate)
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

      // Bitrate in kbps
      inboundBitrateKbps = Math.round((deltaBytesIn * 8) / deltaMs);
      outboundBitrateKbps = Math.round((deltaBytesOut * 8) / deltaMs);

      // Packet loss in %
      const totalExpected = deltaPacketsIn + deltaPacketsLost;
      if (totalExpected > 0) {
        packetLossPercent = Math.round((deltaPacketsLost / totalExpected) * 100);
      }
    } else {
      // First tick fallback
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

    // Evaluate Quality
    const quality = this.determineQuality(
      pc.connectionState,
      pc.iceConnectionState,
      roundTripTimeMs,
      jitterMs,
      packetLossPercent
    );

    return {
      peerId,
      remoteSocketId: socketId,
      connectionState: pc.connectionState,
      iceConnectionState: pc.iceConnectionState,
      quality,
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
   * Evaluates connection state based on RTT, jitter, and packet loss
   */
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
  }

  public stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.peerHistories.clear();
    this.latestStats.clear();
    this.prevQualities.clear();
  }
}

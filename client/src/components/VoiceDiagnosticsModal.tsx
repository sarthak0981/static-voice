import React from 'react';
import { X, Activity, Wifi, ShieldCheck, Cpu } from 'lucide-react';
import { PeerConnectionStats, ConnectionQuality } from '../lib/webrtcDiagnostics.js';
import { MicrophoneState, Participant } from '../types/index.js';

interface VoiceDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  statsMap: Map<string, PeerConnectionStats>;
  localMicrophoneState: MicrophoneState;
  isLocalMuted: boolean;
  isLocalSpeaking: boolean;
  participants: Participant[];
}

export const VoiceDiagnosticsModal: React.FC<VoiceDiagnosticsModalProps> = ({
  isOpen,
  onClose,
  statsMap,
  localMicrophoneState,
  isLocalMuted,
  isLocalSpeaking,
  participants
}) => {
  if (!isOpen) return null;

  const getQualityBadge = (quality: ConnectionQuality) => {
    switch (quality) {
      case 'EXCELLENT':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            EXCELLENT
          </span>
        );
      case 'GOOD':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            GOOD
          </span>
        );
      case 'UNSTABLE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            UNSTABLE
          </span>
        );
      case 'POOR':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-mono font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            POOR
          </span>
        );
    }
  };

  const participantNameMap = new Map<string, string>();
  participants.forEach((p) => {
    participantNameMap.set(p.participantId, p.displayName);
    participantNameMap.set(p.socketId, p.displayName);
  });

  const statsList = Array.from(statsMap.values());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md modal-backdrop-anim select-none">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="WebRTC Voice Diagnostics HUD"
        className="relative w-full max-w-4xl bg-[#090B10] border border-white/10 rounded-2xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl shadow-black/90 max-h-[92dvh] flex flex-col overflow-hidden text-neutral-200 font-sans modal-content-anim"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide flex items-center gap-2">
                WebRTC Voice Diagnostics
                <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/5 border border-white/10 font-mono text-[#8A99AD]">
                  DEV MODE (Ctrl+Shift+D)
                </span>
              </h2>
              <p className="text-xs text-[#8A99AD] font-mono">
                Live RTCPeerConnection.getStats telemetry
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Diagnostics Content */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 text-xs font-mono">
          {/* Section 1: Local Voice Pipeline */}
          <div className="p-4 rounded-xl bg-[#0E1118] border border-white/5">
            <div className="flex items-center justify-between mb-3 text-neutral-300 font-bold text-xs uppercase tracking-wider">
              <span className="flex items-center gap-2">
                <Cpu className="w-3.5 h-3.5 text-emerald-400" />
                Local Microphone Audio Pipeline
              </span>
              <span className="text-[10px] text-[#8A99AD]">Direct Raw WebRTC Path</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                <div className="text-[10px] text-[#8A99AD]">MIC STATE</div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {localMicrophoneState} {isLocalMuted ? '(MUTED)' : ''}
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                <div className="text-[10px] text-[#8A99AD]">VAD DETECTION</div>
                <div className="text-sm font-bold mt-0.5 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isLocalSpeaking ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'
                    }`}
                  />
                  <span className={isLocalSpeaking ? 'text-emerald-300' : 'text-neutral-400'}>
                    {isLocalSpeaking ? 'TALKING' : 'SILENT'}
                  </span>
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                <div className="text-[10px] text-[#8A99AD]">CONSTRAINTS</div>
                <div className="text-xs font-bold text-white mt-0.5">
                  48 kHz • Mono
                </div>
              </div>

              <div className="p-2.5 rounded-lg bg-black/40 border border-white/5">
                <div className="text-[10px] text-[#8A99AD]">NATIVE PROCESSING</div>
                <div className="text-xs font-bold text-emerald-400 mt-0.5 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" />
                  AEC • NS • AGC
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Remote Peers Telemetry */}
          <div className="p-4 rounded-xl bg-[#0E1118] border border-white/5">
            <div className="flex items-center justify-between mb-3 text-neutral-300 font-bold text-xs uppercase tracking-wider">
              <span className="flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                Active Peer Connections ({statsList.length})
              </span>
              <span className="text-[10px] text-[#8A99AD]">Auto-refreshed every 2.5s</span>
            </div>

            {statsList.length === 0 ? (
              <div className="text-center py-6 text-[#8A99AD] text-xs">
                No active remote peers in party yet. Invite someone to see live WebRTC statistics.
              </div>
            ) : (
              <div className="space-y-3">
                {statsList.map((stat) => {
                  const displayName =
                    participantNameMap.get(stat.peerId) ||
                    participantNameMap.get(stat.remoteSocketId) ||
                    stat.peerId.slice(0, 8);

                  return (
                    <div
                      key={stat.peerId}
                      className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2.5"
                    >
                      {/* Peer Top Header */}
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-white font-bold text-xs">
                            {displayName}
                          </span>
                          <span className="text-[10px] text-[#8A99AD]">
                            ({stat.peerId.slice(0, 8)})
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {getQualityBadge(stat.quality)}
                          <span className="text-[10px] px-2 py-0.5 rounded bg-white/5 border border-white/5 text-[#8A99AD]">
                            {stat.codec}
                          </span>
                        </div>
                      </div>

                      {/* Peer Metrics Grid */}
                      <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-[11px]">
                        <div className="bg-white/2 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-[#8A99AD]">ROUND TRIP</div>
                          <div
                            className={`font-bold mt-0.5 ${
                              stat.roundTripTimeMs > 300
                                ? 'text-rose-400'
                                : stat.roundTripTimeMs > 150
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {stat.roundTripTimeMs} ms
                          </div>
                        </div>

                        <div className="bg-white/2 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-[#8A99AD]">JITTER</div>
                          <div
                            className={`font-bold mt-0.5 ${
                              stat.jitterMs > 60
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {stat.jitterMs} ms
                          </div>
                        </div>

                        <div className="bg-white/2 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-[#8A99AD]">PACKET LOSS</div>
                          <div
                            className={`font-bold mt-0.5 ${
                              stat.packetLossPercent > 5
                                ? 'text-rose-400'
                                : stat.packetLossPercent > 2
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                            }`}
                          >
                            {stat.packetLossPercent}%{' '}
                            <span className="text-[9px] text-[#8A99AD]">
                              ({stat.packetsLost})
                            </span>
                          </div>
                        </div>

                        <div className="bg-white/2 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-[#8A99AD]">BITRATE (IN/OUT)</div>
                          <div className="font-bold text-white mt-0.5">
                            {stat.inboundBitrateKbps} / {stat.outboundBitrateKbps} kbps
                          </div>
                        </div>

                        <div className="bg-white/2 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-[#8A99AD]">ICE / CONN STATE</div>
                          <div className="font-bold text-white mt-0.5 truncate">
                            {stat.iceConnectionState} / {stat.connectionState}
                          </div>
                        </div>

                        <div className="bg-white/2 p-2 rounded border border-white/5">
                          <div className="text-[9px] text-[#8A99AD]">AUDIO TRACK</div>
                          <div className="font-bold text-emerald-400 mt-0.5 truncate">
                            {stat.audioTrackState}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-[#8A99AD] font-mono shrink-0">
          <span>Direct WebRTC P2P (TURN Relay as Fallback)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono transition-colors cursor-pointer"
          >
            Close HUD
          </button>
        </div>
      </div>
    </div>
  );
};

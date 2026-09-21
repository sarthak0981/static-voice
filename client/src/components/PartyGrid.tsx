import React from 'react';
import { Crown, WifiOff, Share2, VolumeX } from 'lucide-react';
import { Participant } from '../types/index.js';
import { ConnectionQuality } from '../lib/webrtcDiagnostics.js';
import { VoiceWaveform } from './ui/VoiceWaveform.js';

interface PartyGridProps {
  roomName: string;
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onVolumeChange: (participantId: string, volume: number) => void;
  onKickParticipant: (participantId: string) => void;
  onTransferHost: (participantId: string) => void;
  onOpenShareModal: () => void;
  hostGraceSeconds?: number;
  onReorderParty?: (orderedParticipantIds: string[]) => void;
  isLoungeCollapsed?: boolean;
  onToggleLoungeCollapse?: () => void;
  loungeCount?: number;
  peerVolumes?: Record<string, number>;
  peerQualities?: Record<string, ConnectionQuality>;
  disconnectedPeerIds?: Set<string>;
  onSelectParticipant?: (participant: Participant) => void;
}

export const PartyGrid: React.FC<PartyGridProps> = ({
  participants,
  currentUserId,
  isHost,
  onOpenShareModal,
  peerVolumes = {},
  peerQualities = {},
  disconnectedPeerIds = new Set(),
  onSelectParticipant
}) => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-12 py-6 overflow-y-auto select-none">
      <div className="w-full max-w-2xl mx-auto flex-1 flex flex-col justify-center pb-28 sm:pb-32">
        {participants.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center my-auto py-12">
            <h2 className="text-base font-light text-white tracking-wide">
              The room is quiet
            </h2>
            <p className="mt-1 text-xs text-slate-400 font-mono tracking-wider max-w-xs">
              {isHost
                ? 'Invite others to start a private voice conversation.'
                : 'Waiting for the host to admit guests.'}
            </p>
            {isHost && (
              <button
                type="button"
                onClick={onOpenShareModal}
                className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-medium tracking-wider transition-all cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5 text-static-accentLight" />
                <span>SHARE ROOM ID</span>
              </button>
            )}
          </div>
        ) : (
          <div className="w-full divide-y divide-surface-border/70 border-t border-b border-surface-border/70">
            {participants.map((participant) => {
              const isLocal = participant.participantId === currentUserId;
              const isParticipantHost = participant.role === 'HOST';
              const isSpeaking = participant.isSpeaking;
              const userVol = peerVolumes[participant.participantId] ?? 100;
              const isAudioMutedLocally = userVol === 0;
              const quality = peerQualities[participant.participantId] || peerQualities[participant.socketId];
              const isDisconnected = disconnectedPeerIds.has(participant.participantId);

              return (
                <div
                  key={participant.participantId}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelectParticipant && onSelectParticipant(participant)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectParticipant && onSelectParticipant(participant);
                    }
                  }}
                  className={`group relative flex items-center justify-between py-4 sm:py-5 px-3 rounded-xl transition-all duration-300 cursor-pointer ${
                    isSpeaking && !isDisconnected
                      ? 'bg-static-accent/[0.04]'
                      : 'hover:bg-white/[0.02]'
                  }`}
                >
                  {/* Left: Participant Name & Status (NO AVATARS) */}
                  <div className="flex flex-col items-start min-w-0 pr-4">
                    <div className="flex items-center gap-2.5">
                      <span
                        className={`text-base sm:text-lg tracking-wide truncate transition-all duration-200 ${
                          isDisconnected
                            ? 'text-slate-500 line-through'
                            : isSpeaking
                            ? 'text-white font-medium speaking-glow'
                            : 'text-slate-200 group-hover:text-white font-light'
                        }`}
                      >
                        {isLocal ? 'You' : participant.displayName}
                      </span>

                      {/* Badges */}
                      {isParticipantHost && (
                        <span
                          title="Room Host"
                          className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-300/90"
                        >
                          <Crown className="w-3 h-3 text-amber-400" />
                        </span>
                      )}

                      {isAudioMutedLocally && !isLocal && (
                        <span title="Muted for you" className="text-slate-500">
                          <VolumeX className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {isDisconnected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono text-rose-400 bg-rose-500/10 border border-rose-500/20 animate-pulse">
                          <WifiOff className="w-2.5 h-2.5" />
                          <span>Disconnected</span>
                        </span>
                      )}
                    </div>

                    {/* Subtitle presence */}
                    <span className="text-[11px] font-mono tracking-wider text-slate-500 mt-0.5">
                      {isDisconnected
                        ? 'Reconnecting'
                        : isSpeaking
                        ? 'Speaking…'
                        : quality === 'POOR' || quality === 'UNSTABLE'
                        ? quality.toLowerCase()
                        : 'Connected'}
                    </span>
                  </div>

                  {/* Right: Sound Waveform Visualization */}
                  <div className="flex items-center gap-3 shrink-0">
                    <VoiceWaveform
                      isSpeaking={Boolean(isSpeaking)}
                      isMuted={isAudioMutedLocally}
                      isDisconnected={isDisconnected}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

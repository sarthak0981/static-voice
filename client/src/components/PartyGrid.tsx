import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Crown,
  Loader2,
  Volume2,
  VolumeX,
  PanelRightOpen,
  UserX,
  WifiOff,
  Lock
} from 'lucide-react';
import { Participant } from '../types/index.js';
import { ConnectionQuality } from '../lib/webrtcDiagnostics.js';

interface PartyGridProps {
  roomName: string;
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onVolumeChange: (participantId: string, volume: number) => void;
  onKickParticipant: (participantId: string) => void;
  onTransferHost: (participantId: string) => void;
  onMuteParticipant?: (participantId: string) => void;
  onUnmuteParticipant?: (participantId: string) => void;
  localMutedPeers?: Set<string>;
  onToggleLocalMute?: (participantId: string) => void;
  onOpenShareModal: () => void;
  hostGraceSeconds?: number;
  onReorderParty?: (orderedParticipantIds: string[]) => void;
  isLoungeCollapsed?: boolean;
  onToggleLoungeCollapse?: () => void;
  loungeCount?: number;
  peerVolumes?: Record<string, number>;
  peerQualities?: Record<string, ConnectionQuality>;
  disconnectedPeerIds?: Set<string>;
}

export const PartyGrid: React.FC<PartyGridProps> = ({
  roomName,
  participants,
  currentUserId,
  isHost,
  onVolumeChange,
  onKickParticipant,
  onTransferHost,
  onMuteParticipant,
  onUnmuteParticipant,
  localMutedPeers = new Set(),
  onToggleLocalMute,
  onOpenShareModal,
  onReorderParty,
  isLoungeCollapsed = false,
  onToggleLoungeCollapse,
  loungeCount = 0,
  peerVolumes = {},
  peerQualities = {},
  disconnectedPeerIds = new Set()
}) => {
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);

  // Desktop Drag-and-Drop Handlers (Host Only)
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isHost) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    if (!isHost || draggedIndex === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropTargetIndex !== index) {
      setDropTargetIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    if (!isHost || draggedIndex === null || draggedIndex === targetIndex) {
      setDraggedIndex(null);
      setDropTargetIndex(null);
      return;
    }
    e.preventDefault();

    const reordered = [...participants];
    const [movedParticipant] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, movedParticipant);

    setDraggedIndex(null);
    setDropTargetIndex(null);

    if (onReorderParty) {
      onReorderParty(reordered.map((p) => p.participantId));
    }
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDropTargetIndex(null);
  };

  const isDrawerOpen = !isLoungeCollapsed && isHost && loungeCount > 0;

  // Calculate optimal columns based on side drawer open/closed and participant count
  const getGridColsClass = () => {
    if (participants.length <= 1) {
      return 'grid-cols-1 max-w-sm mx-auto w-full';
    }
    if (participants.length === 2) {
      return 'grid-cols-2 max-w-xl mx-auto w-full';
    }
    if (participants.length <= 4) {
      return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-4 max-w-4xl mx-auto w-full';
    }
    // 5 to 8 participants: adaptively respond to side drawer
    if (isDrawerOpen) {
      return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 w-full';
    }
    return 'grid-cols-2 sm:grid-cols-2 md:grid-cols-4 w-full';
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07080B] p-3 sm:p-5 overflow-y-auto select-none transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
      <div className="w-full max-w-6xl mx-auto flex-1 flex flex-col justify-start pb-28 sm:pb-32">
        {/* Grid Top Bar */}
        <div className="flex items-center justify-between mb-3 sm:mb-4 px-1 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-mono font-bold text-white tracking-wider flex items-center gap-2">
              <span className="truncate max-w-[140px] sm:max-w-[200px]">{roomName || 'PARTY'}</span>
              <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[11px] text-[#8A99AD] font-mono shrink-0">
                {participants.length}/8
              </span>
            </span>

            {isHost && (
              <span className="text-[10px] font-mono text-[#4E586E] hidden md:inline ml-2">
                (Drag cards to reorder)
              </span>
            )}
          </div>

          {/* Right action: Lounge Drawer Toggle button */}
          {loungeCount > 0 && onToggleLoungeCollapse && (
            <button
              type="button"
              onClick={onToggleLoungeCollapse}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-mono transition-colors cursor-pointer ${
                !isLoungeCollapsed
                  ? 'bg-[#00E599]/15 border-[#00E599]/40 text-[#00E599]'
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-[#8A99AD] hover:text-white'
              }`}
            >
              <PanelRightOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">LOUNGE</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#00E599] text-black text-[10px] font-bold font-mono">
                {loungeCount}
              </span>
            </button>
          )}
        </div>

        {/* Grid Canvas: 1 to 8 participants */}
        {participants.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-2xl sm:rounded-3xl bg-[#090B10]/50 my-auto">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#8A99AD] mb-3">
              <Mic className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-mono font-bold text-white mb-1">
              Party is empty
            </h3>
            <p className="text-xs text-[#8A99AD] font-mono max-w-xs mb-4">
              {isHost
                ? 'Share your room code to invite others.'
                : 'Waiting for host to admit participants to the party.'}
            </p>
            {isHost && (
              <button
                type="button"
                onClick={onOpenShareModal}
                className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-semibold tracking-wider transition-colors cursor-pointer active:scale-95"
              >
                Share Room Code
              </button>
            )}
          </div>
        ) : (
          <div className={`grid gap-3 sm:gap-4 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${getGridColsClass()}`}>
            {participants.map((participant, index) => {
              const isLocal = participant.participantId === currentUserId;
              const isParticipantHost = participant.role === 'HOST';
              const isSpeaking = participant.isSpeaking;
              const isBeingDragged = draggedIndex === index;
              const isDropTarget = dropTargetIndex === index && draggedIndex !== index;
              const userVol = peerVolumes[participant.participantId] ?? 100;
              const isAudioMutedLocally = localMutedPeers.has(participant.participantId) || userVol === 0;
              const isHandRaised = !!participant.isHandRaised;
              const isHostMuted = !!participant.isHostMuted;
              const quality = peerQualities[participant.participantId] || peerQualities[participant.socketId];
              const isDisconnected = disconnectedPeerIds.has(participant.participantId);

              return (
                <div
                  key={participant.participantId}
                  data-participant-index={index}
                  draggable={isHost}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={handleDragEnd}
                  className={`relative flex flex-col justify-between p-3.5 sm:p-4 min-h-[160px] sm:min-h-[180px] max-h-[220px] rounded-2xl sm:rounded-3xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${
                    isBeingDragged ? 'opacity-40 scale-95 ring-2 ring-[#00E599]' : ''
                  } ${isDropTarget ? 'scale-105 ring-2 ring-[#00E599]/80 bg-[#00E599]/5' : ''} ${
                    isHandRaised ? 'ring-2 ring-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.3)]' : ''
                  } ${
                    isDisconnected
                      ? 'border-2 border-dashed border-rose-500/60 bg-rose-950/20 shadow-[0_0_16px_rgba(244,63,94,0.18)]'
                      : isParticipantHost
                      ? 'bg-gradient-to-b from-amber-500/10 via-[#0B0D15]/95 to-[#0B0D15] border border-amber-500/30 shadow-lg shadow-black/40'
                      : 'bg-[#0B0D15]/95 border border-white/[0.08] hover:border-white/20 shadow-md shadow-black/30'
                  } ${
                    isSpeaking && !isDisconnected
                      ? 'border-[#00E599]/80 ring-2 ring-[#00E599]/40 shadow-[0_0_24px_rgba(0,229,153,0.2)] bg-[#0E151A]/95'
                      : ''
                  }`}
                >
                {/* Floating Animated Raised Hand Badge: Translucent Low-Opacity Glass with Subtle Amber Glow */}
                {isHandRaised && (
                  <div className="absolute -top-2.5 -right-1.5 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-neutral-950/85 backdrop-blur-md border border-amber-400/50 text-amber-200 text-[10px] font-mono font-bold shadow-[0_0_14px_rgba(251,191,36,0.25)] animate-bounce z-20">
                    <span className="text-xs leading-none select-none">✋</span>
                    <span className="tracking-wider">HAND UP</span>
                  </div>
                )}

                {/* Top Strip: Badges & Diagnostics */}
                <div className="flex items-center justify-between gap-1 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {isDisconnected ? (
                      <span className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[9px] sm:text-[10px] font-mono font-bold tracking-wider animate-pulse">
                        <WifiOff className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
                        <span>DISCONNECTED</span>
                      </span>
                    ) : isParticipantHost ? (
                      <span className="flex items-center gap-1 px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[9px] sm:text-[10px] font-mono font-bold tracking-wider">
                        <Crown className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-amber-400" />
                        <span>HOST</span>
                      </span>
                    ) : null}

                    {isLocal && (
                      <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#8A99AD] text-[9px] font-mono tracking-wider">
                        YOU
                      </span>
                    )}

                    {isHostMuted && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/20 border border-amber-500/40 text-[9px] font-mono font-semibold text-amber-300">
                        <Lock className="w-2.5 h-2.5 text-amber-400" />
                        <span>HOST MUTED</span>
                      </span>
                    )}

                    {!isLocal && !isHost && !isDisconnected && isAudioMutedLocally && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/15 border border-rose-500/30 text-[9px] font-mono text-rose-300">
                        <VolumeX className="w-2.5 h-2.5" />
                        <span>MUTED FOR YOU</span>
                      </span>
                    )}
                  </div>

                  {/* Connection Warning Pill */}
                  {!isLocal && !isDisconnected && (quality === 'UNSTABLE' || quality === 'POOR') && (
                    <span
                      title={quality === 'POOR' ? 'Poor connection' : 'Unstable connection'}
                      className={`flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-mono ${
                        quality === 'POOR'
                          ? 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
                          : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${quality === 'POOR' ? 'bg-rose-400' : 'bg-amber-400'}`} />
                      <span>{quality}</span>
                    </span>
                  )}
                </div>

                {/* Center: Minimalist Avatar with Live Waveform Halo */}
                <div className="flex flex-col items-center justify-center my-2 sm:my-3">
                  <div
                    className={`relative w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-lg sm:text-xl font-bold font-mono tracking-wider transition-all duration-200 ease-out ${
                      isDisconnected
                        ? 'bg-rose-950/40 border border-rose-500/30 text-rose-400 opacity-60 grayscale'
                        : isParticipantHost
                        ? 'border border-amber-400/40 text-amber-300 bg-amber-500/15'
                        : isSpeaking
                        ? 'bg-[#00E599] text-black ring-4 ring-[#00E599]/30 shadow-[0_0_18px_rgba(0,229,153,0.25)] scale-105'
                        : 'bg-[#151824] text-white border border-white/10'
                    }`}
                  >
                    {isParticipantHost && (
                      <Crown className="absolute -top-2 w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    )}

                    {participant.displayName.charAt(0).toUpperCase()}

                    {/* Active Waveform on Speaker Avatar */}
                    {isSpeaking && !isDisconnected && (
                      <div className="absolute -bottom-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/90 border border-[#00E599] text-[#00E599] scale-90 shadow-md">
                        <span className="w-0.5 h-2 bg-[#00E599] rounded-full animate-bounce" />
                        <span
                          className="w-0.5 h-3 bg-[#00E599] rounded-full animate-bounce"
                          style={{ animationDelay: '0.15s' }}
                        />
                        <span
                          className="w-0.5 h-1.5 bg-[#00E599] rounded-full animate-bounce"
                          style={{ animationDelay: '0.3s' }}
                        />
                      </div>
                    )}
                  </div>

                  <h3 className="mt-2 text-xs sm:text-sm font-semibold text-white tracking-wide truncate max-w-[110px] sm:max-w-[150px] text-center">
                    {participant.displayName}
                  </h3>
                </div>

                {/* Bottom Strip: Micro Status + Integrated Action Buttons */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] sm:text-xs">
                  {/* Mic Status */}
                  <div className="flex items-center gap-1">
                    {isDisconnected ? (
                      <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px] font-semibold">
                        <WifiOff className="w-3 h-3" />
                        <span>LOST</span>
                      </span>
                    ) : participant.microphoneState === 'ON' ? (
                      <span className="flex items-center gap-1 text-[#00E599] font-mono text-[10px] font-semibold">
                        <Mic className="w-3 h-3" />
                        <span>LIVE</span>
                      </span>
                    ) : participant.microphoneState === 'MUTED' ? (
                      <span className="flex items-center gap-1 text-rose-400 font-mono text-[10px]">
                        <MicOff className="w-3 h-3 text-rose-400" />
                        <span>MUTED</span>
                      </span>
                    ) : participant.microphoneState === 'CONNECTING' ? (
                      <span className="flex items-center gap-1 text-[#8A99AD] font-mono text-[10px]">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>SYNC</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[#4E586E] font-mono text-[10px]">
                        <MicOff className="w-3 h-3" />
                        <span>OFF</span>
                      </span>
                    )}
                  </div>

                  {/* Direct Action Buttons on Card */}
                  {!isLocal && !isDisconnected && (
                    <div className="flex items-center gap-1">
                      {/* Host: Single Normal Mute/Unmute Button (Locked so participants cannot unmute themselves) */}
                      {isHost ? (
                        !isParticipantHost && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isHostMuted) {
                                onUnmuteParticipant?.(participant.participantId);
                              } else {
                                onMuteParticipant?.(participant.participantId);
                              }
                            }}
                            title={isHostMuted ? 'Unmute participant' : 'Mute participant'}
                            aria-label={isHostMuted ? 'Unmute participant' : 'Mute participant'}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer active:scale-90 ${
                              isHostMuted
                                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                                : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {isHostMuted ? (
                              <MicOff className="w-3.5 h-3.5" />
                            ) : (
                              <Mic className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )
                      ) : (
                        /* Non-Host: Single Local Mute Button (Host Protected) */
                        isParticipantHost ? (
                          <div
                            title="Host cannot be muted"
                            className="p-1.5 rounded-lg border border-white/5 bg-white/[0.02] text-neutral-600 cursor-not-allowed opacity-40 select-none"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onToggleLocalMute) {
                                onToggleLocalMute(participant.participantId);
                              } else {
                                const nextVol = isAudioMutedLocally ? 100 : 0;
                                onVolumeChange(participant.participantId, nextVol);
                              }
                            }}
                            title={isAudioMutedLocally ? 'Unmute Audio for You' : 'Mute Audio for You'}
                            aria-label={isAudioMutedLocally ? 'Unmute Audio for You' : 'Mute Audio for You'}
                            className={`p-1.5 rounded-lg border transition-all cursor-pointer active:scale-90 ${
                              isAudioMutedLocally
                                ? 'bg-rose-500/20 border-rose-500/40 text-rose-300 hover:bg-rose-500/30'
                                : 'bg-white/5 border-white/10 text-neutral-400 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {isAudioMutedLocally ? (
                              <VolumeX className="w-3.5 h-3.5" />
                            ) : (
                              <Volume2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )
                      )}

                      {/* 2. Host Action: Make Host */}
                      {isHost && !isParticipantHost && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onTransferHost(participant.participantId);
                          }}
                          title="Make Host"
                          aria-label="Make Host"
                          className="p-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-400 transition-all cursor-pointer active:scale-90"
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* 3. Host Action: Kick */}
                      {isHost && !isParticipantHost && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onKickParticipant(participant.participantId);
                          }}
                          title="Kick from Party"
                          aria-label="Kick from Party"
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 transition-all cursor-pointer active:scale-90"
                        >
                          <UserX className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
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

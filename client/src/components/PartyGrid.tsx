import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Crown,
  Loader2,
  Volume2,
  VolumeX,
  PanelRightOpen,
  MoreVertical,
  WifiOff
} from 'lucide-react';
import { Participant } from '../types/index.js';
import { ConnectionQuality } from '../lib/webrtcDiagnostics.js';

interface PartyGridProps {
  roomName: string;
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onRemoveParticipant: (participantId: string) => void;
  onTransferHost: (participantId: string) => void;
  onOpenShareModal: () => void;
  hostGraceSeconds?: number;
  onReorderParty?: (orderedParticipantIds: string[]) => void;
  isLoungeCollapsed?: boolean;
  onToggleLoungeCollapse?: () => void;
  loungeCount?: number;
  onSelectParticipantForAction?: (participant: Participant) => void;
  peerVolumes?: Record<string, number>;
  peerQualities?: Record<string, ConnectionQuality>;
  disconnectedPeerIds?: Set<string>;
}

export const PartyGrid: React.FC<PartyGridProps> = ({
  roomName,
  participants,
  currentUserId,
  isHost,
  onOpenShareModal,
  onReorderParty,
  isLoungeCollapsed = false,
  onToggleLoungeCollapse,
  loungeCount = 0,
  onSelectParticipantForAction,
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

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07080B] p-2.5 sm:p-5 overflow-y-auto select-none">
      {/* Grid Top Bar */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 px-1">
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
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 border border-dashed border-white/10 rounded-2xl sm:rounded-3xl bg-[#090B10]/50">
          <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-[#8A99AD] mb-3">
            <Mic className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-mono font-bold text-white mb-1">
            Party is empty
          </h3>
          <p className="text-xs text-[#8A99AD] font-mono max-w-xs mb-4">
            Share the 6-character room code to start talking in real time without downloads or accounts.
          </p>
          <button
            type="button"
            onClick={onOpenShareModal}
            className="px-5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono font-semibold tracking-wider transition-colors cursor-pointer active:scale-95"
          >
            SHARE ROOM CODE
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4 auto-rows-fr">
          {participants.map((participant, index) => {
            const isLocal = participant.participantId === currentUserId;
            const isParticipantHost = participant.role === 'HOST';
            const isSpeaking = participant.isSpeaking;
            const isBeingDragged = draggedIndex === index;
            const isDropTarget = dropTargetIndex === index && draggedIndex !== index;
            const userVol = peerVolumes[participant.participantId] ?? 100;
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
                className={`relative flex justify-between p-3 sm:p-4 rounded-2xl transition-all duration-200 ease-out select-none ${
                  isBeingDragged ? 'opacity-40 scale-95 ring-2 ring-[#00E599]' : ''
                } ${isDropTarget ? 'scale-105 ring-2 ring-[#00E599]/80 bg-[#00E599]/5' : ''} ${
                  isDisconnected
                    ? 'border-2 border-dashed border-rose-500/60 bg-rose-950/20 shadow-[0_0_16px_rgba(244,63,94,0.18)]'
                    : isParticipantHost
                    ? 'bg-gradient-to-b from-amber-500/10 to-[#0E1017] border border-amber-500/30 shadow-lg shadow-black/40'
                    : 'bg-[#0E1017]/90 border border-white/8 hover:border-white/20 shadow-md shadow-black/30'
                } ${
                  isSpeaking && !isDisconnected
                    ? 'border-[#00E599]/80 ring-1 ring-[#00E599]/50 shadow-[0_0_20px_rgba(0,229,153,0.16)] bg-[#10161A]/90'
                    : ''
                }`}
              >
                {/* Main Card Body (Left Column) */}
                <div className="flex-1 flex flex-col justify-between min-w-0 pr-1 sm:pr-2">
                  {/* Card Top: Badges & Status */}
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap mb-2">
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

                    {/* Volume Pill if adjusted locally */}
                    {!isLocal && !isDisconnected && userVol !== 100 && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-[#8A99AD]">
                        {userVol === 0 ? (
                          <VolumeX className="w-2.5 h-2.5 text-rose-400" />
                        ) : (
                          <Volume2 className="w-2.5 h-2.5" />
                        )}
                        <span>{userVol}%</span>
                      </span>
                    )}

                    {/* Subtle Connection Health Warning (Only shown when unstable or poor) */}
                    {!isLocal && !isDisconnected && quality === 'UNSTABLE' && (
                      <span
                        title="Unstable connection (high jitter/latency)"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-mono text-amber-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>UNSTABLE</span>
                      </span>
                    )}
                    {!isLocal && !isDisconnected && quality === 'POOR' && (
                      <span
                        title="Poor connection (packet loss detected)"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[9px] font-mono text-rose-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                        <span>POOR</span>
                      </span>
                    )}
                  </div>

                  {/* Card Center: Minimal Avatar with Organic Waveform */}
                  <div
                    onClick={() => {
                      if (!isLocal && onSelectParticipantForAction) {
                        onSelectParticipantForAction(participant);
                      }
                    }}
                    className="flex flex-col items-center justify-center my-1.5 sm:my-2 cursor-pointer"
                  >
                    <div
                      className={`relative w-12 h-12 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-base sm:text-xl font-bold font-mono tracking-wider transition-all duration-200 ease-out ${
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

                    <h3 className="mt-2 text-xs sm:text-sm font-semibold text-white tracking-wide truncate max-w-[100px] sm:max-w-[140px] text-center">
                      {participant.displayName}
                    </h3>
                  </div>

                  {/* Card Bottom: Microphone Status Indicator */}
                  <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[10px] sm:text-xs">
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

                    <span className="text-[10px] font-mono text-[#4E586E] hidden sm:inline">
                      #{index + 1}
                    </span>
                  </div>
                </div>

                {/* Right Rail: Minimal Vertical Control Buttons (For Remote Participants) */}
                {!isLocal && onSelectParticipantForAction && (
                  <div className="flex flex-col justify-center gap-2 pl-1.5 sm:pl-2 border-l border-white/5 shrink-0">
                    {/* 1. Volume / Options Button */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectParticipantForAction(participant);
                      }}
                      title={isHost ? 'Participant & Volume Controls' : `Adjust Volume (${userVol}%)`}
                      aria-label="Adjust participant volume"
                      className={`w-8 h-8 sm:w-8 sm:h-8 rounded-xl flex items-center justify-center transition-all cursor-pointer active:scale-90 ${
                        userVol === 0
                          ? 'bg-rose-500/15 border border-rose-500/30 text-rose-400 hover:bg-rose-500/25'
                          : userVol !== 100
                          ? 'bg-[#00E599]/15 border border-[#00E599]/30 text-[#00E599] hover:bg-[#00E599]/25'
                          : 'bg-white/5 hover:bg-white/10 border border-white/5 text-[#8A99AD] hover:text-white'
                      }`}
                    >
                      {userVol === 0 ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>

                    {/* 2. Quick Host Action Button (Host Only) */}
                    {isHost && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectParticipantForAction(participant);
                        }}
                        title="Host Actions (Transfer, Move, Kick)"
                        aria-label="Host Actions"
                        className="w-8 h-8 sm:w-8 sm:h-8 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/20 text-amber-300 flex items-center justify-center transition-all cursor-pointer active:scale-90"
                      >
                        <MoreVertical className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

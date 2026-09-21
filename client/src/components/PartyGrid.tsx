import React, { useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  Crown,
  Loader2,
  Sparkles,
  Volume2,
  VolumeX,
  PanelRightOpen,
  MoreVertical
} from 'lucide-react';
import { Participant } from '../types/index.js';
import { ConnectionQuality } from '../lib/webrtcDiagnostics.js';

interface PartyGridProps {
  roomName: string;
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  onRemoveParticipant: (participantId: string) => void;
  onMuteParticipant: (participantId: string) => void;
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
  peerQualities = {}
}) => {
  const isPartyFull = participants.length >= 8;
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [holdingParticipantId, setHoldingParticipantId] = useState<string | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const touchDragIndexRef = useRef<number | null>(null);

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

  // Touchscreen Long-Press and Drag Handling
  const handleTouchStart = (e: React.TouchEvent, participant: Participant, index: number) => {
    const isLocal = participant.participantId === currentUserId;
    if (isLocal) return;

    const touch = e.touches[0];
    if (!touch) return;

    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchDragIndexRef.current = index;
    isDraggingRef.current = false;
    setHoldingParticipantId(participant.participantId);

    // Start 600ms long-press timer for Action Sheet
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      // If user hasn't dragged, trigger action sheet
      if (!isDraggingRef.current && onSelectParticipantForAction) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(35);
        }
        setHoldingParticipantId(null);
        onSelectParticipantForAction(participant);
      }
    }, 600);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchDragIndexRef.current === null) return;
    const touch = e.touches[0];
    if (!touch || !touchStartPosRef.current) return;

    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // If moved more than 10px, cancel long-press and activate touch shift mode (if host)
    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setHoldingParticipantId(null);

      if (isHost) {
        isDraggingRef.current = true;
        setDraggedIndex(touchDragIndexRef.current);

        const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
        const card = targetEl?.closest('[data-participant-index]') as HTMLElement | null;
        if (card && card.dataset.participantIndex !== undefined) {
          const targetIdx = parseInt(card.dataset.participantIndex, 10);
          if (!isNaN(targetIdx) && targetIdx !== dropTargetIndex) {
            setDropTargetIndex(targetIdx);
          }
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    setHoldingParticipantId(null);

    if (!isHost || touchDragIndexRef.current === null) {
      setDraggedIndex(null);
      setDropTargetIndex(null);
      touchDragIndexRef.current = null;
      touchStartPosRef.current = null;
      return;
    }

    if (
      isDraggingRef.current &&
      draggedIndex !== null &&
      dropTargetIndex !== null &&
      draggedIndex !== dropTargetIndex
    ) {
      const reordered = [...participants];
      const [movedParticipant] = reordered.splice(draggedIndex, 1);
      reordered.splice(dropTargetIndex, 0, movedParticipant);

      if (onReorderParty) {
        onReorderParty(reordered.map((p) => p.participantId));
      }
    }

    setDraggedIndex(null);
    setDropTargetIndex(null);
    touchDragIndexRef.current = null;
    touchStartPosRef.current = null;
    isDraggingRef.current = false;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#07080B] p-3 sm:p-5 overflow-y-auto select-none">
      {/* Grid Top Bar */}
      <div className="flex items-center justify-between mb-3 sm:mb-4 px-1">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#00E599] animate-pulse" />
          <h2 className="text-xs sm:text-sm font-bold font-mono tracking-wider text-white uppercase truncate max-w-[200px] sm:max-w-xs">
            {roomName || 'Party Voice'}
          </h2>
          <span className="text-[10px] sm:text-xs font-mono text-[#8A99AD] bg-white/5 border border-white/10 px-2 py-0.5 rounded-full">
            {participants.length} / 8
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Collapse Lounge toggle on desktop for host */}
          {isHost && isLoungeCollapsed && onToggleLoungeCollapse && (
            <button
              type="button"
              onClick={onToggleLoungeCollapse}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
            >
              <PanelRightOpen className="w-3.5 h-3.5 text-amber-400" />
              <span>Lounge ({loungeCount})</span>
            </button>
          )}

          {/* Share Room Code button */}
          {!isPartyFull && (
            <button
              type="button"
              onClick={onOpenShareModal}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-white transition-colors cursor-pointer active:scale-95"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00E599]" />
              <span className="hidden sm:inline">INVITE</span>
            </button>
          )}
        </div>
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
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 auto-rows-fr">
          {participants.map((participant, index) => {
            const isLocal = participant.participantId === currentUserId;
            const isParticipantHost = participant.role === 'HOST';
            const isSpeaking = participant.isSpeaking;
            const isBeingDragged = draggedIndex === index;
            const isDropTarget = dropTargetIndex === index && draggedIndex !== index;
            const isHolding = holdingParticipantId === participant.participantId;
            const userVol = peerVolumes[participant.participantId] ?? 100;
            const quality = peerQualities[participant.participantId] || peerQualities[participant.socketId];

            return (
              <div
                key={participant.participantId}
                data-participant-index={index}
                draggable={isHost}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, participant, index)}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onContextMenu={(e) => {
                  if (!isLocal && onSelectParticipantForAction) {
                    e.preventDefault();
                    onSelectParticipantForAction(participant);
                  }
                }}
                className={`relative flex flex-col justify-between p-3.5 sm:p-5 rounded-2xl transition-all duration-200 ease-out select-none ${
                  isBeingDragged ? 'opacity-40 scale-95 ring-2 ring-[#00E599]' : ''
                } ${isDropTarget ? 'scale-105 ring-2 ring-[#00E599]/80 bg-[#00E599]/5' : ''} ${
                  isHolding ? 'scale-95 ring-2 ring-[#00E599] bg-white/10' : ''
                } ${
                  isParticipantHost
                    ? 'bg-gradient-to-b from-amber-500/10 to-[#0E1017] border border-amber-500/30 shadow-lg shadow-black/40'
                    : 'bg-[#0E1017]/90 border border-white/8 hover:border-white/20 shadow-md shadow-black/30'
                } ${
                  isSpeaking
                    ? 'border-[#00E599]/80 ring-1 ring-[#00E599]/50 shadow-[0_0_20px_rgba(0,229,153,0.16)] bg-[#10161A]/90'
                    : ''
                }`}
              >
                {/* Card Top: Badges & Desktop Options Button */}
                <div className="flex items-center justify-between w-full mb-2 sm:mb-3 gap-1.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                    {isParticipantHost && (
                      <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold tracking-wider">
                        <Crown className="w-3 h-3 text-amber-400" />
                        <span>HOST</span>
                      </span>
                    )}
                    {isLocal && (
                      <span className="px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[#8A99AD] text-[9px] font-mono tracking-wider">
                        YOU
                      </span>
                    )}
                    {/* Volume Pill if adjusted locally */}
                    {!isLocal && userVol !== 100 && (
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
                    {!isLocal && quality === 'UNSTABLE' && (
                      <span
                        title="Unstable connection (high jitter/latency)"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[9px] font-mono text-amber-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                        <span>UNSTABLE</span>
                      </span>
                    )}
                    {!isLocal && quality === 'POOR' && (
                      <span
                        title="Poor connection (packet loss detected)"
                        className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-[9px] font-mono text-rose-300"
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                        <span>POOR</span>
                      </span>
                    )}
                  </div>

                  {/* Desktop More Options Button (Universal: Volume for all, Host actions for host) */}
                  {!isLocal && onSelectParticipantForAction && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectParticipantForAction(participant);
                      }}
                      title={isHost ? 'Host & Volume Controls' : 'Adjust Playback Volume'}
                      className="hidden sm:flex w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 items-center justify-center text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Card Center: Minimal Avatar with Organic Waveform */}
                <div
                  onClick={() => {
                    if (!isLocal && onSelectParticipantForAction) {
                      onSelectParticipantForAction(participant);
                    }
                  }}
                  className="flex flex-col items-center justify-center my-2 sm:my-3 cursor-pointer"
                >
                  <div
                    className={`relative w-14 h-14 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center text-lg sm:text-2xl font-bold font-mono tracking-wider transition-all duration-200 ease-out ${
                      isParticipantHost
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
                    {isSpeaking && (
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

                  <h3 className="mt-2.5 sm:mt-3 text-xs sm:text-sm font-semibold text-white tracking-wide truncate max-w-[120px] sm:max-w-[150px] text-center">
                    {participant.displayName}
                  </h3>
                </div>

                {/* Card Bottom: Microphone Status Indicator */}
                <div className="flex items-center justify-between pt-2 sm:pt-2.5 border-t border-white/5 text-[10px] sm:text-xs">
                  <div className="flex items-center gap-1">
                    {participant.microphoneState === 'ON' ? (
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

                  {/* Position number on desktop grid */}
                  <span className="text-[10px] font-mono text-[#4E586E] hidden sm:inline">
                    #{index + 1}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

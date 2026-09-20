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
  peerVolumes = {}
}) => {
  const isPartyFull = participants.length >= 8;
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const [holdingParticipantId, setHoldingParticipantId] = useState<string | null>(null);

  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef<boolean>(false);
  const touchDragIndexRef = useRef<number | null>(null);

  // Desktop Drag-and-Drop Handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (!isHost) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
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
    const [moved] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, moved);

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

  // Mobile Touch Long-Press and Drag-to-Shift Handlers
  const handleTouchStart = (e: React.TouchEvent, participant: Participant, index: number) => {
    if (!isHost) return;
    const touch = e.touches[0];
    if (!touch) return;

    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
    touchDragIndexRef.current = index;
    isDraggingRef.current = false;
    setHoldingParticipantId(participant.participantId);

    // Start 650ms long-press timer for Host Mobile Action Sheet
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      // If user hasn't dragged, trigger long-press host action sheet
      if (!isDraggingRef.current && onSelectParticipantForAction) {
        if (typeof navigator !== 'undefined' && navigator.vibrate) {
          navigator.vibrate(40);
        }
        setHoldingParticipantId(null);
        onSelectParticipantForAction(participant);
      }
    }, 650);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isHost || touchDragIndexRef.current === null) return;
    const touch = e.touches[0];
    if (!touch || !touchStartPosRef.current) return;

    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);

    // If moved more than 10px, cancel long-press and activate touch shift mode
    if (dx > 10 || dy > 10) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      isDraggingRef.current = true;
      setHoldingParticipantId(null);
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
      return;
    }

    const fromIdx = touchDragIndexRef.current;
    const toIdx = dropTargetIndex;

    touchDragIndexRef.current = null;
    touchStartPosRef.current = null;
    setDraggedIndex(null);
    setDropTargetIndex(null);

    // If dragged to a new spot, apply reorder
    if (isDraggingRef.current && toIdx !== null && fromIdx !== toIdx) {
      const reordered = [...participants];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      if (onReorderParty) {
        onReorderParty(reordered.map((p) => p.participantId));
      }
    }
    isDraggingRef.current = false;
  };

  return (
    <section
      className="flex-1 flex flex-col p-3 sm:p-6 overflow-y-auto pb-[max(8rem,calc(env(safe-area-inset-bottom)+5rem))]"
      aria-label="Party Voice Area"
    >
      {/* Header: Clean Studio Aesthetics */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-widest text-[#00E599] uppercase">
              ACTIVE PARTY
            </span>
            <span className="text-xs font-mono font-medium text-[#8A99AD] tracking-wider">
              {participants.length} / 8
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white font-sans truncate max-w-md">
            {roomName}
          </h1>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Host Button to Unhide Lounge if collapsed */}
          {isHost && isLoungeCollapsed && onToggleLoungeCollapse && (
            <button
              type="button"
              onClick={onToggleLoungeCollapse}
              title="Unhide Lounge Area"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[#8A99AD] hover:text-white text-xs font-mono transition-all duration-200 cursor-pointer"
            >
              <PanelRightOpen className="w-3.5 h-3.5 text-[#00E599]" />
              <span>SHOW LOUNGE</span>
              {loungeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#00E599]/20 text-[#00E599] text-[10px] font-bold font-mono">
                  {loungeCount}
                </span>
              )}
            </button>
          )}

          {isPartyFull && (
            <span className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#00E599]/10 border border-[#00E599]/30 text-[#00E599] text-xs font-mono font-medium">
              <Sparkles className="w-3.5 h-3.5" />
              <span>ROOM PACKED</span>
            </span>
          )}
        </div>
      </div>

      {/* Mobile Host Tip */}
      {isHost && participants.length > 1 && (
        <div className="sm:hidden mb-3 px-1 flex items-center justify-between text-[11px] font-mono text-[#4E586E]">
          <span>💡 Hold card for volume & host controls</span>
          <span>Drag to reorder</span>
        </div>
      )}

      {/* Main Party Grid */}
      {participants.length === 1 && isHost ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-white/10 bg-white/2">
          <div className="w-16 h-16 rounded-2xl bg-[#12141C] border border-white/10 flex items-center justify-center mb-4 text-[#00E599]">
            <Volume2 className="w-8 h-8 opacity-80" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">You're the only one here.</h3>
          <p className="text-sm text-[#8A99AD] max-w-sm mb-6 font-light">
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
                  if (isHost && onSelectParticipantForAction) {
                    e.preventDefault();
                    onSelectParticipantForAction(participant);
                  }
                }}
                className={`relative flex flex-col justify-between p-3.5 sm:p-5 rounded-2xl transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] select-none ${
                  isBeingDragged ? 'opacity-40 scale-95 ring-2 ring-[#00E599]' : ''
                } ${isDropTarget ? 'scale-105 ring-2 ring-[#00E599]/80 bg-[#00E599]/5' : ''} ${
                  isHolding ? 'scale-95 ring-2 ring-[#00E599] bg-white/10' : ''
                } ${
                  isParticipantHost
                    ? 'bg-gradient-to-b from-amber-500/10 to-[#0E1017] border border-amber-500/30 shadow-lg shadow-black/40'
                    : 'bg-[#0E1017]/90 border border-white/8 hover:border-white/20 shadow-md shadow-black/30'
                } ${
                  isSpeaking
                    ? 'border-[#00E599]/80 shadow-[0_0_24px_rgba(0,229,153,0.18)] bg-[#10161A]/90'
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
                    {/* Volume Pill if adjusted */}
                    {!isLocal && userVol !== 100 && (
                      <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-[9px] font-mono text-[#8A99AD]">
                        {userVol === 0 ? <VolumeX className="w-2.5 h-2.5 text-rose-400" /> : <Volume2 className="w-2.5 h-2.5" />}
                        <span>{userVol}%</span>
                      </span>
                    )}
                  </div>

                  {/* Desktop More Options Button (Host only) */}
                  {isHost && onSelectParticipantForAction && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectParticipantForAction(participant);
                      }}
                      title="Participant Controls"
                      className="hidden sm:flex w-7 h-7 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 items-center justify-center text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
                    >
                      <MoreVertical className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Card Center: Minimal Avatar with Razor-Thin Speaking Ring */}
                <div
                  onClick={() => {
                    if (isHost && onSelectParticipantForAction) {
                      onSelectParticipantForAction(participant);
                    }
                  }}
                  className="flex flex-col items-center justify-center my-2 sm:my-3 cursor-pointer"
                >
                  <div
                    className={`relative w-14 h-14 sm:w-18 sm:h-18 rounded-2xl flex items-center justify-center text-lg sm:text-2xl font-bold font-mono tracking-wider transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                      isParticipantHost
                        ? 'border border-amber-400/40 text-amber-300 bg-amber-500/15'
                        : isSpeaking
                        ? 'bg-[#00E599] text-black ring-4 ring-[#00E599]/30 shadow-[0_0_20px_rgba(0,229,153,0.3)] scale-105'
                        : 'bg-[#151824] text-white border border-white/10'
                    }`}
                  >
                    {isParticipantHost && (
                      <Crown className="absolute -top-2 w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    )}

                    {participant.displayName.charAt(0).toUpperCase()}

                    {/* Active Waveform on Speaker Avatar */}
                    {isSpeaking && (
                      <div className="absolute -bottom-1.5 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-black/90 border border-[#00E599] text-[#00E599] scale-90">
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

                  {/* Minimal Status Text */}
                  <span className="text-[10px] font-mono text-[#4E586E]">
                    {isSpeaking ? 'TALKING' : 'IDLE'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

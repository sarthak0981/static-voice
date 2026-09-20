import React, { useState, useRef } from 'react';
import {
  Mic,
  MicOff,
  Crown,
  UserX,
  Loader2,
  Sparkles,
  Volume2,
  ShieldAlert,
  GripVertical,
  PanelRightOpen
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
}

export const PartyGrid: React.FC<PartyGridProps> = ({
  roomName,
  participants,
  currentUserId,
  isHost,
  onRemoveParticipant,
  onMuteParticipant,
  onTransferHost,
  onOpenShareModal,
  hostGraceSeconds,
  onReorderParty,
  isLoungeCollapsed = false,
  onToggleLoungeCollapse,
  loungeCount = 0
}) => {
  const isPartyFull = participants.length >= 8;
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dropTargetIndex, setDropTargetIndex] = useState<number | null>(null);
  const touchDragIndexRef = useRef<number | null>(null);

  // Host Desktop Drag-and-Drop Reordering Handlers
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

  // Host Mobile Touch Drag-and-Drop Reordering Handlers
  const handleTouchStart = (_e: React.TouchEvent, index: number) => {
    if (!isHost) return;
    touchDragIndexRef.current = index;
    setDraggedIndex(index);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isHost || touchDragIndexRef.current === null) return;
    const touch = e.touches[0];
    if (!touch) return;
    const targetEl = document.elementFromPoint(touch.clientX, touch.clientY);
    const card = targetEl?.closest('[data-participant-index]') as HTMLElement | null;
    if (card && card.dataset.participantIndex !== undefined) {
      const targetIdx = parseInt(card.dataset.participantIndex, 10);
      if (!isNaN(targetIdx) && targetIdx !== dropTargetIndex) {
        setDropTargetIndex(targetIdx);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!isHost || touchDragIndexRef.current === null) {
      setDraggedIndex(null);
      setDropTargetIndex(null);
      return;
    }
    const fromIdx = touchDragIndexRef.current;
    const toIdx = dropTargetIndex;

    touchDragIndexRef.current = null;
    setDraggedIndex(null);
    setDropTargetIndex(null);

    if (toIdx !== null && fromIdx !== toIdx) {
      const reordered = [...participants];
      const [moved] = reordered.splice(fromIdx, 1);
      reordered.splice(toIdx, 0, moved);
      if (onReorderParty) {
        onReorderParty(reordered.map((p) => p.participantId));
      }
    }
  };

  return (
    <section
      className="flex-1 flex flex-col p-3 sm:p-6 overflow-y-auto pb-[max(8rem,calc(env(safe-area-inset-bottom)+5rem))]"
      aria-label="Party Voice Area"
    >
      {/* Header with Room Name, Capacity, and Lounge Unhide Toggle */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 sm:mb-6 shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono font-bold tracking-widest text-static-accent uppercase">
              ACTIVE PARTY
            </span>
            <span className="text-xs font-mono font-semibold text-static-subtext tracking-wider">
              {participants.length} / 8
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-white font-sans truncate max-w-md">
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
              <PanelRightOpen className="w-3.5 h-3.5 text-static-accent" />
              <span>SHOW LOUNGE</span>
              {loungeCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-static-accent/20 text-static-accent text-[10px] font-bold font-mono">
                  {loungeCount}
                </span>
              )}
            </button>
          )}

          {isPartyFull && (
            <span className="self-start sm:self-auto flex items-center gap-1.5 px-3 py-1 rounded-full bg-static-accent/10 border border-static-accent/30 text-static-accent text-xs font-mono font-medium animate-pulse">
              <Sparkles className="w-3.5 h-3.5" />
              <span>THE PARTY IS PACKED! 🎉</span>
            </span>
          )}
        </div>
      </div>

      {/* Host Disconnect Grace Period Countdown Banner */}
      {hostGraceSeconds && hostGraceSeconds > 0 && (
        <div className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 flex items-center justify-between gap-3 text-xs font-mono animate-pulse shrink-0">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Host disconnected. Holding room for reconnection ({hostGraceSeconds}s)…</span>
          </div>
          <span className="text-[10px] text-amber-400/80">Auto-transfer in {hostGraceSeconds}s</span>
        </div>
      )}

      {/* Grid of participant cards */}
      {participants.length === 1 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-6 rounded-2xl border border-dashed border-surface-border/80 bg-surface/30">
          <div className="w-16 h-16 rounded-2xl bg-surface-card border border-surface-border flex items-center justify-center mb-4 text-static-accent">
            <Volume2 className="w-8 h-8 opacity-80" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">You're the only one here.</h3>
          <p className="text-sm text-static-subtext max-w-sm mb-6">
            Share the 6-character room code to start talking in real time without downloads or accounts.
          </p>
          <button
            type="button"
            onClick={onOpenShareModal}
            className="px-5 py-2.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-medium transition-colors cursor-pointer"
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

            return (
              <div
                key={participant.participantId}
                data-participant-index={index}
                draggable={isHost}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={handleDragEnd}
                className={`relative flex flex-col justify-between p-3 sm:p-5 rounded-xl sm:rounded-2xl transition-all duration-200 ${
                  isBeingDragged ? 'card-dragging' : ''
                } ${isDropTarget ? 'card-drop-target' : ''} ${
                  isParticipantHost
                    ? 'bg-gradient-to-b from-amber-500/10 to-surface-card border-2 border-amber-400/80 shadow-[0_0_24px_rgba(251,191,36,0.15)]'
                    : 'bg-surface-card border border-surface-border hover:border-surface-border/80'
                } ${
                  isSpeaking
                    ? 'border-static-accent/90 speaking-glow bg-surface-hover/70'
                    : ''
                }`}
              >
                {/* Card Top: Badges, Host Drag Handle & Host Master Controls */}
                <div className="flex items-center justify-between w-full mb-2 sm:mb-3 gap-1.5">
                  <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                    {/* Host Drag Grip Handle (supports mouse drag and mobile touch drag) */}
                    {isHost && (
                      <div
                        title="Drag to rearrange position for everyone in real time"
                        onTouchStart={(e) => handleTouchStart(e, index)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        className="cursor-grab active:cursor-grabbing p-1 text-static-muted hover:text-white transition-colors touch-none select-none"
                      >
                        <GripVertical className="w-3.5 h-3.5" />
                      </div>
                    )}

                    {isParticipantHost && (
                      <span className="flex items-center gap-1 px-1.5 sm:px-2.5 py-0.5 sm:py-1 rounded-md bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] sm:text-[11px] font-mono tracking-wider font-bold shadow-sm">
                        <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-400 fill-amber-400" />
                        <span>HOST</span>
                      </span>
                    )}
                    {isLocal && (
                      <span className="px-1.5 sm:px-2 py-0.5 rounded-md bg-surface-elevated border border-surface-border text-static-subtext text-[9px] sm:text-[10px] font-mono tracking-wider">
                        YOU
                      </span>
                    )}
                  </div>

                  {/* Host Master Actions for other participants */}
                  {isHost && !isParticipantHost && !isLocal && (
                    <div className="flex items-center gap-0.5 sm:gap-1">
                      {/* Host Master Mute */}
                      {participant.microphoneState === 'ON' && (
                        <button
                          type="button"
                          onClick={() => onMuteParticipant(participant.participantId)}
                          title="Mute Participant (Master Control)"
                          aria-label={`Mute ${participant.displayName}`}
                          className="p-1 sm:p-1.5 rounded-lg text-static-muted hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
                        >
                          <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        </button>
                      )}

                      {/* Host Transfer */}
                      <button
                        type="button"
                        onClick={() => onTransferHost(participant.participantId)}
                        title="Transfer Host to this Participant"
                        aria-label={`Make ${participant.displayName} Host`}
                        className="p-1 sm:p-1.5 rounded-lg text-static-muted hover:text-amber-400 hover:bg-amber-400/10 transition-colors cursor-pointer"
                      >
                        <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>

                      {/* Remove from Party */}
                      <button
                        type="button"
                        onClick={() => onRemoveParticipant(participant.participantId)}
                        title="Remove from Party"
                        aria-label={`Remove ${participant.displayName} from Party`}
                        className="p-1 sm:p-1.5 rounded-lg text-static-muted hover:text-static-danger hover:bg-static-danger/10 transition-colors cursor-pointer"
                      >
                        <UserX className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Card Middle: Avatar with Host Aura & Speaking Visualizer */}
                <div className="flex flex-col items-center justify-center my-2 sm:my-4">
                  <div
                    className={`relative w-14 h-14 sm:w-20 sm:h-20 rounded-xl sm:rounded-2xl flex items-center justify-center text-lg sm:text-2xl font-bold font-mono tracking-wider transition-transform duration-150 ${
                      isParticipantHost
                        ? 'border-2 border-amber-400 text-amber-300 bg-amber-500/15 shadow-md shadow-amber-500/20'
                        : isSpeaking
                        ? 'bg-static-accent text-background scale-105 shadow-lg shadow-static-accent/30'
                        : 'bg-surface-elevated text-white border border-surface-border'
                    }`}
                  >
                    {isParticipantHost && (
                      <Crown className="absolute -top-2.5 sm:-top-3 w-4 h-4 sm:w-5 sm:h-5 text-amber-400 fill-amber-400 filter drop-shadow-md animate-bounce" />
                    )}

                    {participant.displayName.charAt(0).toUpperCase()}

                    {/* Active Waveform on Speaker Avatar */}
                    {isSpeaking && (
                      <div className="absolute -bottom-1.5 sm:-bottom-2 flex items-center gap-0.5 px-1.5 sm:px-2 py-0.5 rounded-full bg-background/90 border border-static-accent text-static-accent scale-90 sm:scale-100">
                        <span className="w-0.5 sm:w-1 h-2 sm:h-2.5 bg-static-accent rounded-full animate-bounce" />
                        <span
                          className="w-0.5 sm:w-1 h-3 sm:h-3.5 bg-static-accent rounded-full animate-bounce"
                          style={{ animationDelay: '0.15s' }}
                        />
                        <span
                          className="w-0.5 sm:w-1 h-1.5 sm:h-2 bg-static-accent rounded-full animate-bounce"
                          style={{ animationDelay: '0.3s' }}
                        />
                      </div>
                    )}
                  </div>

                  <h3 className="mt-2 sm:mt-3 text-xs sm:text-base font-bold text-white tracking-wide truncate max-w-[120px] sm:max-w-[160px] text-center">
                    {participant.displayName}
                  </h3>
                </div>

                {/* Card Bottom: Microphone Status Indicator */}
                <div className="flex items-center justify-between pt-2 sm:pt-3 border-t border-surface-border/50 text-[10px] sm:text-xs">
                  <div className="flex items-center gap-1 sm:gap-1.5">
                    {participant.microphoneState === 'ON' ? (
                      <span className="flex items-center gap-1 text-static-accent font-mono text-[10px] sm:text-[11px] font-semibold">
                        <Mic className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span>LIVE</span>
                      </span>
                    ) : participant.microphoneState === 'MUTED' ? (
                      <span className="flex items-center gap-1 text-static-muted font-mono text-[10px] sm:text-[11px]">
                        <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-static-danger" />
                        <span>MUTED</span>
                      </span>
                    ) : participant.microphoneState === 'CONNECTING' ? (
                      <span className="flex items-center gap-1 text-static-subtext font-mono text-[10px] sm:text-[11px]">
                        <Loader2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 animate-spin" />
                        <span className="hidden xs:inline sm:inline">SYNC</span>
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-static-muted font-mono text-[10px] sm:text-[11px]">
                        <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        <span>OFF</span>
                      </span>
                    )}
                  </div>

                  {isSpeaking && (
                    <span className="text-[9px] sm:text-[10px] font-mono text-static-accent uppercase tracking-widest animate-pulse">
                      SPEAKING
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

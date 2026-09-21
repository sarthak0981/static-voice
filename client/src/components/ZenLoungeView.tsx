import React, { useState, useEffect } from 'react';
import { LogOut, Check, Trash2, UserCheck } from 'lucide-react';
import { Participant, MicrophoneState } from '../types/index.js';

interface ZenLoungeViewProps {
  displayName: string;
  partyName: string;
  roomCode: string;
  participants?: Participant[];
  currentUserId?: string;
  isHost?: boolean;
  microphoneState?: MicrophoneState;
  onEnableMic?: () => void;
  onLeaveRoom: () => void;
  onAdmitParticipant?: (participantId: string) => void;
  onClearLounge?: () => void;
}

export const ZenLoungeView: React.FC<ZenLoungeViewProps> = ({
  displayName,
  partyName: _partyName,
  roomCode,
  participants = [],
  currentUserId,
  isHost = false,
  microphoneState: _microphoneState,
  onEnableMic: _onEnableMic,
  onLeaveRoom,
  onAdmitParticipant,
  onClearLounge
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(timer);
  }, []);

  const formatElapsed = (joinedAt?: number) => {
    if (!joinedAt) return 'just now';
    const diffMs = now - joinedAt;
    const mins = Math.floor(diffMs / 60000);
    if (mins < 1) return '<1m';
    return `${mins}m`;
  };

  // If participants list is empty or doesn't include the current user, show at least current user
  const displayList = participants.length > 0 ? participants : [
    {
      participantId: currentUserId || 'self',
      socketId: 'self',
      displayName,
      role: isHost ? ('HOST' as const) : ('GUEST' as const),
      state: 'LOUNGE' as const,
      joinedAt: now
    }
  ];

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col justify-between px-6 py-8 sm:px-12 sm:py-10 bg-static-atmosphere bg-static-noise text-static-text select-none overflow-y-auto">
      {/* Subtle quiet background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[300px] bg-static-accent/5 rounded-full blur-[140px] pointer-events-none" />

      {/* Header */}
      <header className="w-full max-w-3xl mx-auto flex items-start justify-between z-10 pt-[env(safe-area-inset-top)]">
        <div>
          <h1 className="text-xl font-light tracking-[0.35em] text-white uppercase">
            S T A T I C
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-mono tracking-wider text-slate-300">
              Lounge
            </span>
            <span className="text-slate-600">&bull;</span>
            <span className="text-xs text-slate-400 font-light">
              Waiting to be let in...
            </span>
          </div>
        </div>

        <div className="text-right">
          {roomCode && (
            <div className="text-xs font-mono tracking-widest text-slate-400">
              Room ID: <span className="text-white font-semibold">{roomCode}</span>
            </div>
          )}
          <div className="mt-1 text-xs font-mono tracking-wider text-slate-500">
            {displayList.length} / 50
          </div>
        </div>
      </header>

      {/* Main Waiting List Stage (NO AVATARS) */}
      <main className="w-full max-w-3xl mx-auto flex-1 flex flex-col justify-center my-8 z-10">
        <div className="border-t border-b border-surface-border divide-y divide-surface-border">
          {displayList.map((participant) => {
            const isLocal = participant.participantId === currentUserId || participant.displayName === displayName;
            const waitTime = formatElapsed(participant.joinedAt);

            return (
              <div
                key={participant.participantId}
                className="flex items-center justify-between py-4 px-2 hover:bg-white/[0.02] transition-colors"
              >
                {/* Participant Name only */}
                <div className="flex items-center gap-3 min-w-0 pr-4">
                  <span className={`text-sm sm:text-base tracking-wide truncate ${isLocal ? 'text-white font-medium' : 'text-slate-300'}`}>
                    {participant.displayName}
                  </span>
                  {isLocal && (
                    <span className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">
                      (You)
                    </span>
                  )}
                </div>

                {/* Status / Host action */}
                <div className="flex items-center gap-3 shrink-0">
                  {isHost && onAdmitParticipant && !isLocal && (
                    <button
                      type="button"
                      onClick={() => onAdmitParticipant(participant.participantId)}
                      className="px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/20 text-white font-mono text-xs transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span>ADMIT</span>
                    </button>
                  )}
                  <span className="text-xs font-mono tracking-wider text-slate-500">
                    {waitTime}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Status badges */}
        <div className="mt-6 flex items-center justify-between px-2 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-slate-400">Microphone Tested & Ready</span>
          </div>

          {isHost && onClearLounge && displayList.length > 0 && (
            <button
              type="button"
              onClick={onClearLounge}
              className="text-xs font-mono text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear Lounge</span>
            </button>
          )}
        </div>
      </main>

      {/* Footer / Leave */}
      <footer className="w-full max-w-3xl mx-auto flex items-center justify-between z-10 pb-[env(safe-area-inset-bottom)] pt-4">
        <span className="text-[11px] font-mono tracking-wider text-slate-600 uppercase">
          Waiting for host admission
        </span>

        <button
          type="button"
          onClick={onLeaveRoom}
          className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-mono text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>LEAVE LOUNGE</span>
        </button>
      </footer>
    </div>
  );
};

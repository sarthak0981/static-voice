import React, { useState } from 'react';
import { UserCheck, UserX, Clock, Users, X, Trash2, AlertTriangle, PanelRightClose } from 'lucide-react';
import { Participant } from '../types/index.js';

interface LoungeDrawerProps {
  participants: Participant[];
  currentUserId: string;
  isHost: boolean;
  partyCount: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onAdmitParticipant: (participantId: string) => void;
  onKickParticipant: (participantId: string) => void;
  onClearLounge: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const LoungeDrawer: React.FC<LoungeDrawerProps> = ({
  participants,
  currentUserId,
  isHost,
  partyCount,
  isOpenMobile,
  onCloseMobile,
  onAdmitParticipant,
  onKickParticipant,
  onClearLounge,
  isCollapsed = false,
  onToggleCollapse
}) => {
  const [isConfirmClearOpen, setIsConfirmClearOpen] = useState(false);
  const isPartyFull = partyCount >= 8;

  // Only host is permitted to view lounge drawer
  if (!isHost) return null;

  const content = (
    <div className="flex flex-col h-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-surface-border shrink-0">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-sm font-mono tracking-wider uppercase text-white font-medium flex items-center gap-2">
            <Users className="w-3.5 h-3.5 text-slate-400" />
            Lounge
          </h3>
          <span className="text-xs font-mono text-slate-500">
            {participants.length} / 50
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {isHost && participants.length > 0 && (
            <button
              type="button"
              onClick={() => setIsConfirmClearOpen(true)}
              title="Clear all waiting guests"
              className="flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-[11px] font-mono transition-colors cursor-pointer"
            >
              <Trash2 className="w-3 h-3" />
              <span>CLEAR</span>
            </button>
          )}

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Hide Lounge"
              aria-label="Hide Lounge"
              className="hidden lg:flex items-center gap-1 px-2 py-1 rounded bg-surface-card hover:bg-surface-hover text-slate-400 hover:text-white text-[11px] font-mono transition-colors cursor-pointer"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
              <span>HIDE</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close Lounge"
            className="lg:hidden p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Confirmation Banner for Clear Lounge */}
      {isConfirmClearOpen && (
        <div className="p-3 bg-rose-500/15 border-b border-rose-500/30">
          <div className="flex items-start gap-2 mb-2 text-left">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <p className="text-xs text-white">
              Remove all <span className="font-bold">{participants.length}</span> waiting guests from the lounge?
            </p>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsConfirmClearOpen(false)}
              className="px-2.5 py-1 rounded bg-surface-card text-white text-[11px] font-mono cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setIsConfirmClearOpen(false);
                onClearLounge();
              }}
              className="px-2.5 py-1 rounded bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-mono font-semibold cursor-pointer"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Waiting List (NO AVATARS) */}
      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {participants.length === 0 ? (
          <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-slate-500">
            <Clock className="w-6 h-6 opacity-40 mb-2" />
            <p className="text-xs font-mono">The lounge is quiet.</p>
          </div>
        ) : (
          participants.map((user) => {
            const isLocal = user.participantId === currentUserId;

            return (
              <div
                key={user.participantId}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-card border border-surface-border hover:border-surface-border-strong transition-colors"
              >
                <div className="min-w-0 pr-2">
                  <span className="text-xs sm:text-sm font-medium text-white truncate block">
                    {user.displayName} {isLocal && '(You)'}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    Waiting
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onAdmitParticipant(user.participantId)}
                    disabled={isPartyFull}
                    title={isPartyFull ? 'The party is full' : 'Admit to Party'}
                    className="px-2.5 py-1 rounded bg-white/10 hover:bg-white text-white hover:text-black text-[11px] font-mono font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <UserCheck className="w-3 h-3" />
                    <span>ADMIT</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onKickParticipant(user.participantId)}
                    title="Kick from Lounge"
                    aria-label={`Kick ${user.displayName}`}
                    className="p-1 rounded text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                  >
                    <UserX className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  // Desktop Side Panel
  const desktopDrawer = (
    <aside
      className={`hidden lg:flex flex-col bg-surface/90 border-l border-surface-border transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] overflow-hidden shrink-0 z-10 ${
        isCollapsed ? 'w-0 opacity-0 border-l-0' : 'w-72 xl:w-80 opacity-100'
      }`}
    >
      {content}
    </aside>
  );

  // Mobile Bottom Sheet
  const mobileDrawer = isOpenMobile && (
    <div className="fixed inset-0 z-50 flex items-end lg:hidden select-none">
      <div
        className="fixed inset-0 bg-black/70 backdrop-blur-xs modal-backdrop-anim"
        onClick={onCloseMobile}
      />
      <div className="relative w-full max-h-[75dvh] bg-surface border-t border-surface-border rounded-t-3xl overflow-hidden modal-content-anim shadow-2xl flex flex-col pb-[max(1rem,env(safe-area-inset-bottom))]">
        {content}
      </div>
    </div>
  );

  return (
    <>
      {desktopDrawer}
      {mobileDrawer}
    </>
  );
};

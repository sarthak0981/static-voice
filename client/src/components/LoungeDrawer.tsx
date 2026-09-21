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

  // Only the host is permitted to view the lounge drawer or waiting guests
  if (!isHost) return null;

  const content = (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 sm:p-5 border-b border-surface-border shrink-0">
        <div className="flex items-baseline gap-2.5">
          <h3 className="text-base sm:text-lg font-bold tracking-tight text-white font-sans flex items-center gap-2">
            <Users className="w-4 h-4 text-static-subtext" />
            LOUNGE
          </h3>
          <span className="text-xs sm:text-sm font-mono font-semibold text-static-subtext tracking-wider">
            {participants.length} / 50
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Host Master Control: Clear Lounge */}
          {isHost && participants.length > 0 && (
            <button
              type="button"
              onClick={() => setIsConfirmClearOpen(true)}
              title="Clear all waiting guests from Lounge"
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-static-danger/10 hover:bg-static-danger/20 border border-static-danger/30 text-static-danger text-[11px] font-mono font-semibold tracking-wider transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>CLEAR</span>
            </button>
          )}

          {/* Internal Integrated Hide Button for Host */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Hide Lounge area so the whole party is visible"
              aria-label="Hide Lounge"
              className="hidden lg:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface-card hover:bg-surface-hover border border-surface-border text-[#8A99AD] hover:text-white text-[11px] font-mono transition-colors cursor-pointer"
            >
              <PanelRightClose className="w-3.5 h-3.5" />
              <span>HIDE</span>
            </button>
          )}

          {/* Mobile close button */}
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close Lounge"
            className="lg:hidden p-1.5 rounded-lg text-static-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Confirmation Banner for Clear Lounge */}
      {isConfirmClearOpen && (
        <div className="p-3 bg-static-danger/15 border-b border-static-danger/30 animate-in fade-in duration-150">
          <div className="flex items-start gap-2 mb-2 text-left">
            <AlertTriangle className="w-4 h-4 text-static-danger shrink-0 mt-0.5" />
            <p className="text-xs text-white">
              Remove all <span className="font-bold">{participants.length}</span> waiting guests from the lounge? Active party members will not be affected.
            </p>
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={() => setIsConfirmClearOpen(false)}
              className="px-2.5 py-1 rounded-md bg-surface-card hover:bg-surface-elevated text-white text-[11px] font-mono cursor-pointer"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={() => {
                setIsConfirmClearOpen(false);
                onClearLounge();
              }}
              className="px-2.5 py-1 rounded-md bg-static-danger hover:bg-static-danger/90 text-white text-[11px] font-mono font-bold cursor-pointer"
            >
              CLEAR LOUNGE
            </button>
          </div>
        </div>
      )}

      {/* Waiting List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {participants.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4">
            <Clock className="w-8 h-8 text-static-muted/40 mb-2" />
            <p className="text-sm text-static-muted font-medium">The lounge is quiet.</p>
            <p className="text-xs text-static-muted/60 mt-1">Waiting guests will appear here.</p>
          </div>
        ) : (
          participants.map((user) => {
            const isLocal = user.participantId === currentUserId;

            return (
              <div
                key={user.participantId}
                className="flex items-center justify-between p-3 rounded-xl bg-surface-card border border-surface-border hover:border-surface-border/80 transition-colors"
              >
                {/* User Info */}
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  <div className="w-8 h-8 rounded-lg bg-surface-elevated flex items-center justify-center text-xs font-bold font-mono text-white shrink-0">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs sm:text-sm font-medium text-white truncate">
                      {user.displayName} {isLocal && '(You)'}
                    </span>
                    <span className="text-[10px] font-mono text-static-muted">
                      Waiting
                    </span>
                  </div>
                </div>

                {/* Host Actions: COME ON IN and KICK */}
                {isHost && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => onAdmitParticipant(user.participantId)}
                      disabled={isPartyFull}
                      title={isPartyFull ? 'The party is packed! 🎉' : 'Admit to Party'}
                      className="px-2 sm:px-2.5 py-1.5 rounded-lg bg-static-accent/15 hover:bg-static-accent text-static-accent hover:text-background border border-static-accent/30 text-[11px] font-mono font-semibold tracking-wider transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      <UserCheck className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">COME ON IN</span>
                      <span className="sm:hidden">ADMIT</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onKickParticipant(user.participantId)}
                      title="Kick from Lounge"
                      aria-label={`Kick ${user.displayName}`}
                      className="p-1.5 rounded-lg text-static-muted hover:text-static-danger hover:bg-static-danger/10 transition-colors cursor-pointer"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Info: Show capacity notice only when party is full */}
      {isPartyFull && (
        <div className="p-3 border-t border-surface-border/60 text-center text-[11px] font-mono text-amber-400 shrink-0">
          Party is at maximum capacity (8/8)
        </div>
      )}
    </div>
  );

  return (
    <>
      {!isCollapsed && (
        <aside className="hidden lg:flex w-80 xl:w-96 border-l border-surface-border bg-surface/50 backdrop-blur-sm flex-col shrink-0 animate-in fade-in duration-200">
          {content}
        </aside>
      )}

      {isOpenMobile && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative ml-auto w-full max-w-xs sm:max-w-sm h-[100dvh] bg-surface border-l border-surface-border shadow-2xl flex flex-col z-10 animate-in slide-in-from-right duration-200 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
            {content}
          </div>
        </div>
      )}
    </>
  );
};

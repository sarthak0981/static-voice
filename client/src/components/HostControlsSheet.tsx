import React from 'react';
import {
  X,
  Share2,
  Lock,
  Unlock,
  Trash2,
  UserCheck,
  UserX,
  AlertTriangle
} from 'lucide-react';

interface HostControlsSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenShareModal: () => void;
  invitationsOpen: boolean;
  onToggleInvitations: (open: boolean) => void;
  loungeCount: number;
  onClearLounge: () => void;
  onToggleLoungeDrawer?: () => void;
  onOpenHostTransfer?: () => void;
  onPromptEndRoom: () => void;
}

export const HostControlsSheet: React.FC<HostControlsSheetProps> = ({
  isOpen,
  onClose,
  onOpenShareModal,
  invitationsOpen,
  onToggleInvitations,
  loungeCount,
  onClearLounge,
  onToggleLoungeDrawer,
  onOpenHostTransfer,
  onPromptEndRoom
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim select-none">
      <div
        className="w-full max-w-md bg-surface border-t sm:border border-surface-border rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl modal-content-anim text-left max-h-[85dvh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label="Host Controls"
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-5">
          <div>
            <h2 className="text-lg font-light tracking-wide text-white">
              Host Controls
            </h2>
            <p className="text-xs text-slate-400 font-light mt-0.5">
              Manage your room.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Actions List */}
        <div className="space-y-2.5">
          {/* 1. Invite People */}
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenShareModal();
            }}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-static-accentLight">
                <Share2 className="w-4 h-4" />
              </div>
              <div>
                <span className="block text-sm font-medium text-white">Invite People</span>
                <span className="block text-xs text-slate-400">View and copy room ID</span>
              </div>
            </div>
          </button>

          {/* 2. Stop / Reopen Invites */}
          <button
            type="button"
            onClick={() => onToggleInvitations(!invitationsOpen)}
            className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border transition-colors text-left cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-amber-300">
                {invitationsOpen ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
              </div>
              <div>
                <span className="block text-sm font-medium text-white">
                  {invitationsOpen ? 'Stop Invitations' : 'Reopen Invitations'}
                </span>
                <span className="block text-xs text-slate-400">
                  {invitationsOpen ? 'Block new guests from joining' : 'Allow new guests to join'}
                </span>
              </div>
            </div>
            <span className={`text-[11px] font-mono px-2 py-0.5 rounded ${invitationsOpen ? 'text-emerald-400 bg-emerald-500/10' : 'text-amber-400 bg-amber-500/10'}`}>
              {invitationsOpen ? 'OPEN' : 'PAUSED'}
            </span>
          </button>

          {/* 3. Lounge Drawer / Guests */}
          {onToggleLoungeDrawer && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onToggleLoungeDrawer();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-slate-300">
                  <UserCheck className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-white">Lounge Guests</span>
                  <span className="block text-xs text-slate-400">Review and admit waiting guests</span>
                </div>
              </div>
              {loungeCount > 0 && (
                <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-full bg-static-accent/20 text-static-accentLight">
                  {loungeCount} waiting
                </span>
              )}
            </button>
          )}

          {/* 4. Clear Lounge */}
          {loungeCount > 0 && (
            <button
              type="button"
              onClick={() => {
                onClearLounge();
                onClose();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center text-rose-400">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-rose-300">Clear Lounge</span>
                  <span className="block text-xs text-slate-400">Remove all waiting guests</span>
                </div>
              </div>
            </button>
          )}

          {/* 5. Transfer Host */}
          {onOpenHostTransfer && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenHostTransfer();
              }}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border transition-colors text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-amber-400">
                  <UserX className="w-4 h-4" />
                </div>
                <div>
                  <span className="block text-sm font-medium text-white">Transfer Host</span>
                  <span className="block text-xs text-slate-400">Assign host role to another participant</span>
                </div>
              </div>
            </button>
          )}
        </div>

        {/* Destructive: End Room */}
        <div className="mt-6 pt-4 border-t border-surface-border">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPromptEndRoom();
            }}
            className="w-full py-3 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 font-mono text-xs font-semibold tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>END ROOM FOR EVERYONE</span>
          </button>
        </div>
      </div>
    </div>
  );
};

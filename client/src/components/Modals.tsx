import React, { useState } from 'react';
import { X, Copy, Check, Share2, Shield, AlertTriangle, Lock, Unlock } from 'lucide-react';
import { RoomSummary } from '../types/index.js';

interface EndRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmEnd: () => void;
  isLoading: boolean;
}

export const EndRoomModal: React.FC<EndRoomModalProps> = ({
  isOpen,
  onClose,
  onConfirmEnd,
  isLoading
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim">
      <div className="w-full max-w-sm max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-surface-border shadow-2xl p-5 sm:p-6 text-center modal-content-anim">
        <div className="w-12 h-12 rounded-xl bg-static-danger/10 border border-static-danger/20 text-static-danger flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-6 h-6" />
        </div>

        <h3 className="text-lg font-bold text-white mb-2">End this room for everyone?</h3>
        <p className="text-sm text-static-subtext mb-6">
          All party and lounge members will be disconnected and the room will be closed permanently.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-medium transition-colors cursor-pointer min-h-[44px]"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={onConfirmEnd}
            disabled={isLoading}
            className="flex-1 py-3 px-4 rounded-xl bg-static-danger text-white font-semibold text-sm hover:bg-static-danger/90 transition-colors shadow-lg shadow-static-danger/20 cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {isLoading ? 'CLOSING…' : 'END ROOM'}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
}

export const ShareModal: React.FC<ShareModalProps> = ({ isOpen, onClose, roomId }) => {
  const [copiedCode, setCopiedCode] = useState(false);

  if (!isOpen) return null;

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopiedCode(true);
      // Automatically close modal after copying so host doesn't have to manually close
      setTimeout(() => {
        setCopiedCode(false);
        onClose();
      }, 450);
    } catch {
      // Fallback
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'STATIC Voice Room',
          text: `Join my STATIC room using Code: ${roomId}`
        });
        setTimeout(() => {
          onClose();
        }, 400);
      } catch {}
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-surface-border shadow-2xl p-5 sm:p-6 modal-content-anim">
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-5">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-static-accent" />
            <h3 className="text-lg font-bold text-white">SHARE ROOM CODE</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg text-static-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Room Code Display Box */}
        <div className="mb-5">
          <label className="block text-xs uppercase font-mono tracking-wider text-static-muted mb-2">
            Room Access Code
          </label>
          <div
            onClick={handleCopyCode}
            title="Click to copy code"
            className="flex flex-col items-center justify-center p-5 rounded-2xl bg-surface-card hover:bg-surface-hover border border-surface-border hover:border-static-accent/40 gap-3 text-center cursor-pointer transition-all active:scale-[0.99] group"
          >
            <span className="font-mono text-3xl sm:text-4xl tracking-[0.25em] font-extrabold text-static-accent group-hover:scale-105 transition-transform select-all">
              {roomId}
            </span>
            <p className="text-xs text-static-subtext font-light">
              Tap code or button below to copy.
            </p>
          </div>
        </div>

        {/* Action button */}
        <button
          type="button"
          onClick={handleCopyCode}
          className="w-full py-3.5 px-4 min-h-[44px] rounded-xl bg-static-accent text-background font-mono font-bold text-xs tracking-wider flex items-center justify-center gap-2 hover:bg-static-accent/90 active:scale-[0.99] transition-all shadow-md cursor-pointer mb-3"
        >
          {copiedCode ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span>{copiedCode ? 'CODE COPIED TO CLIPBOARD' : 'COPY ROOM CODE'}</span>
        </button>

        {/* Mobile Web Share API option */}
        {typeof navigator !== 'undefined' && 'share' in navigator && (
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-xs font-mono font-medium flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Share2 className="w-3.5 h-3.5 text-static-accent" />
            <span>SHARE CODE VIA APPS</span>
          </button>
        )}
      </div>
    </div>
  );
};

interface RoomSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  room: RoomSummary;
  onToggleInvitations: (open: boolean) => void;
  onPromptEndRoom: () => void;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  room,
  onToggleInvitations,
  onPromptEndRoom
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim">
      <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-surface-border shadow-2xl p-5 sm:p-6 modal-content-anim">
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-5">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-static-accent" />
            <h3 className="text-lg font-bold text-white">ROOM SETTINGS</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-lg text-static-muted hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invitations Control */}
        <div className="p-4 rounded-xl bg-surface-card border border-surface-border mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="block text-sm font-semibold text-white">Room Invitations</span>
            <span className="block text-xs text-static-muted">
              {room.invitationsOpen
                ? 'Anyone with the link can join the Lounge'
                : 'New joins are blocked until reopened'}
            </span>
          </div>

          <button
            type="button"
            onClick={() => onToggleInvitations(!room.invitationsOpen)}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-mono font-semibold tracking-wider flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
              room.invitationsOpen
                ? 'bg-static-accent/15 text-static-accent border border-static-accent/30 hover:bg-static-accent/25'
                : 'bg-static-warning/15 text-static-warning border border-static-warning/30 hover:bg-static-warning/25'
            }`}
          >
            {room.invitationsOpen ? (
              <>
                <Unlock className="w-3.5 h-3.5" />
                <span>OPEN</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" />
                <span>CLOSED</span>
              </>
            )}
          </button>
        </div>

        {/* Live Counts */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="p-3.5 rounded-xl bg-surface-card border border-surface-border">
            <span className="block text-[11px] font-mono text-static-muted uppercase">
              Party Members
            </span>
            <span className="text-xl font-mono font-bold text-white">
              {room.partyCount} / {room.partyCapacity}
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-surface-card border border-surface-border">
            <span className="block text-[11px] font-mono text-static-muted uppercase">
              Lounge Guests
            </span>
            <span className="text-xl font-mono font-bold text-white">
              {room.loungeCount} / {room.loungeCapacity}
            </span>
          </div>
        </div>

        {/* Destructive Action: End Room */}
        <div className="pt-4 border-t border-surface-border">
          <button
            type="button"
            onClick={() => {
              onClose();
              onPromptEndRoom();
            }}
            className="w-full py-3 px-4 min-h-[44px] rounded-xl bg-static-danger/10 hover:bg-static-danger/20 border border-static-danger/30 text-static-danger text-sm font-semibold tracking-wider font-mono transition-colors cursor-pointer"
          >
            END ROOM FOR EVERYONE
          </button>
        </div>
      </div>
    </div>
  );
};

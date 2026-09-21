import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  Share2,
  AlertTriangle,
  Lock,
  Unlock,
  Activity,
  Sparkles,
  HelpCircle
} from 'lucide-react';
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim select-none">
      <div className="w-full max-w-sm bg-surface border border-surface-border rounded-2xl p-6 text-center modal-content-anim shadow-2xl">
        <div className="w-10 h-10 rounded-full bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto mb-3">
          <AlertTriangle className="w-5 h-5" />
        </div>

        <h3 className="text-base font-medium text-white mb-1.5">
          End room for everyone?
        </h3>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          All participants will be disconnected immediately and this room will be permanently destroyed.
        </p>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-xs font-mono font-medium transition-colors cursor-pointer"
          >
            CANCEL
          </button>
          <button
            type="button"
            onClick={onConfirmEnd}
            disabled={isLoading}
            className="flex-1 py-2.5 px-4 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-mono font-semibold transition-colors cursor-pointer disabled:opacity-50"
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
          text: `Join my STATIC room using ID: ${roomId}`
        });
        setTimeout(() => onClose(), 400);
      } catch {}
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim select-none">
      <div className="w-full max-w-sm bg-surface border border-surface-border rounded-2xl p-6 modal-content-anim shadow-2xl text-left">
        <div className="flex items-center justify-between pb-3 border-b border-surface-border mb-5">
          <h3 className="text-sm font-mono tracking-wider uppercase text-white font-medium">
            Share Room ID
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4 leading-relaxed font-light">
          Share this private ID with people you want in your voice room.
        </p>

        {/* Room Code Box */}
        <div
          onClick={handleCopyCode}
          className="group relative flex items-center justify-between p-4 rounded-xl bg-surface-card border border-surface-border hover:border-static-accent/60 transition-all cursor-pointer mb-4"
        >
          <span className="font-mono text-xl sm:text-2xl tracking-[0.25em] text-white font-semibold">
            {roomId}
          </span>
          <span className="flex items-center gap-1 text-xs font-mono text-slate-400 group-hover:text-white">
            {copiedCode ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span className="text-emerald-400">COPIED</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                <span>COPY</span>
              </>
            )}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyCode}
            className="flex-1 py-2.5 px-4 rounded-xl bg-white text-black font-mono font-semibold text-xs tracking-wider hover:bg-white/90 transition-colors cursor-pointer"
          >
            {copiedCode ? 'COPIED TO CLIPBOARD' : 'COPY ROOM ID'}
          </button>

          {typeof navigator !== 'undefined' && typeof navigator.share === 'function' && (
            <button
              type="button"
              onClick={handleNativeShare}
              title="Share via device"
              className="p-2.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
            </button>
          )}
        </div>
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
  onToggleDiagnostics?: () => void;
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  isOpen,
  onClose,
  room,
  onToggleInvitations,
  onPromptEndRoom,
  onToggleDiagnostics
}) => {
  const [activeCategory, setActiveCategory] = useState<'ROOM' | 'AUDIO' | 'APPEARANCE' | 'HELP'>('ROOM');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim select-none">
      <div className="w-full max-w-md bg-surface border border-surface-border rounded-2xl p-6 shadow-2xl modal-content-anim text-left">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-surface-border mb-5">
          <h3 className="text-sm font-mono tracking-widest uppercase text-white font-medium">
            Settings
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Categories Bar: Room, Audio, Appearance, Help */}
        <div className="flex items-center gap-4 border-b border-surface-border pb-3 mb-5 overflow-x-auto no-scrollbar">
          {(['ROOM', 'AUDIO', 'APPEARANCE', 'HELP'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`font-mono text-xs tracking-wider uppercase transition-colors cursor-pointer shrink-0 ${
                activeCategory === cat
                  ? 'text-white font-semibold border-b-2 border-static-accent pb-1 -mb-[14px]'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Tab 1: ROOM */}
        {activeCategory === 'ROOM' && (
          <div className="space-y-4">
            {/* Invitations */}
            <div className="p-4 rounded-xl bg-surface-card border border-surface-border flex items-center justify-between gap-3">
              <div>
                <span className="block text-sm font-medium text-white">Invitations</span>
                <span className="block text-xs text-slate-400">
                  {room.invitationsOpen ? 'New guests can join lounge' : 'New joins are currently blocked'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleInvitations(!room.invitationsOpen)}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  room.invitationsOpen
                    ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                    : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                }`}
              >
                {room.invitationsOpen ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                <span>{room.invitationsOpen ? 'OPEN' : 'PAUSED'}</span>
              </button>
            </div>

            {/* Capacities */}
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-surface-card border border-surface-border">
                <span className="text-slate-500 block">PARTY</span>
                <span className="text-white text-base font-semibold mt-1 block">
                  {room.partyCount} / {room.partyCapacity}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-surface-card border border-surface-border">
                <span className="text-slate-500 block">LOUNGE</span>
                <span className="text-white text-base font-semibold mt-1 block">
                  {room.loungeCount} / {room.loungeCapacity}
                </span>
              </div>
            </div>

            {/* End Room */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onPromptEndRoom();
                }}
                className="w-full py-2.5 px-4 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 text-xs font-mono tracking-wider font-semibold transition-colors cursor-pointer"
              >
                END ROOM FOR EVERYONE
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: AUDIO */}
        {activeCategory === 'AUDIO' && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-surface-card border border-surface-border">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="w-4 h-4 text-static-accentLight" />
                <span className="text-sm font-medium text-white">Voice Pipeline</span>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-light">
                High-definition Opus audio with real-time Voice Activity Detection (VAD) and hardware echo cancellation.
              </p>
            </div>

            {onToggleDiagnostics && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onToggleDiagnostics();
                }}
                className="w-full flex items-center justify-between p-3.5 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-left cursor-pointer transition-colors"
              >
                <div>
                  <span className="block text-xs font-mono font-semibold text-white">
                    WebRTC Diagnostics HUD
                  </span>
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Inspect peer packet loss, latency and jitter
                  </span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-white/5 px-2 py-1 rounded">
                  Ctrl+Shift+D
                </span>
              </button>
            )}
          </div>
        )}

        {/* Tab 3: APPEARANCE */}
        {activeCategory === 'APPEARANCE' && (
          <div className="space-y-3 text-xs">
            <div className="p-4 rounded-xl bg-surface-card border border-surface-border">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-static-accentLight" />
                <span className="text-sm font-medium text-white">Atmospheric Dark Foundation</span>
              </div>
              <p className="text-slate-400 leading-relaxed font-light">
                Near-black deep blue-black (#060709) with restrained electric violet accents. Designed for zero eye strain during prolonged conversations.
              </p>
            </div>
          </div>
        )}

        {/* Tab 4: HELP */}
        {activeCategory === 'HELP' && (
          <div className="space-y-3 text-xs leading-relaxed">
            <div className="p-4 rounded-xl bg-surface-card border border-surface-border">
              <div className="flex items-center gap-2 mb-2">
                <HelpCircle className="w-4 h-4 text-static-accentLight" />
                <span className="text-sm font-medium text-white">Voice, without the noise.</span>
              </div>
              <p className="text-slate-400 font-light mb-3">
                STATIC provides private, direct WebRTC voice communications without accounts, cookies, downloads, or telemetry tracking.
              </p>
              <div className="text-[11px] font-mono text-slate-500 space-y-1">
                <p>&bull; No avatars: Name + Sound represents presence</p>
                <p>&bull; End-to-end encrypted peer audio streaming</p>
                <p>&bull; Zero recordings or transcripts stored</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

import React from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Crown,
  UserX,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Participant } from '../types/index.js';
import { ConnectionQuality } from '../lib/webrtcDiagnostics.js';

interface HostActionSheetProps {
  participant: Participant | null;
  isOpen: boolean;
  onClose: () => void;
  volume: number; // 0 to 100
  isCurrentUserHost?: boolean;
  connectionQuality?: ConnectionQuality;
  onVolumeChange: (participantId: string, volume: number) => void;
  onTransferHost?: (participantId: string) => void;
  onRemoveFromParty?: (participantId: string) => void;
  onKickParticipant?: (participantId: string) => void;
  onShiftLeft?: (participantId: string) => void;
  onShiftRight?: (participantId: string) => void;
  canShiftLeft?: boolean;
  canShiftRight?: boolean;
}

export const HostActionSheet: React.FC<HostActionSheetProps> = ({
  participant,
  isOpen,
  onClose,
  volume,
  isCurrentUserHost = false,
  connectionQuality,
  onVolumeChange,
  onTransferHost,
  onKickParticipant,
  onShiftLeft,
  onShiftRight,
  canShiftLeft = false,
  canShiftRight = false
}) => {
  if (!isOpen || !participant) return null;

  const isMutedLocally = volume === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim select-none">
      <div
        className="w-full max-w-md bg-surface border-t sm:border border-surface-border rounded-t-3xl sm:rounded-2xl p-6 shadow-2xl modal-content-anim text-left max-h-[85dvh] overflow-y-auto"
        role="dialog"
        aria-modal="true"
        aria-label={`Controls for ${participant.displayName}`}
      >
        {/* Header (NO AVATARS) */}
        <div className="flex items-center justify-between pb-4 border-b border-surface-border mb-6">
          <div className="min-w-0 pr-3">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-light tracking-wide text-white truncate">
                {participant.displayName}
              </h2>
              {participant.role === 'HOST' && (
                <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded border border-amber-400/20">
                  HOST
                </span>
              )}
            </div>
            {connectionQuality && (
              <span className="text-[11px] font-mono text-slate-400 mt-0.5 block">
                Quality: {connectionQuality.toLowerCase()}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Volume Slider & Local Mute */}
        <div className="p-4 rounded-xl bg-surface-card border border-surface-border mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-mono uppercase tracking-wider text-slate-400">
              Participant Volume
            </span>
            <span className="text-xs font-mono text-white font-semibold">
              {isMutedLocally ? 'MUTED' : `${volume}%`}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => onVolumeChange(participant.participantId, isMutedLocally ? 100 : 0)}
              title={isMutedLocally ? 'Unmute' : 'Mute locally'}
              className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {isMutedLocally ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => onVolumeChange(participant.participantId, Number(e.target.value))}
              aria-label="Volume slider"
              className="w-full h-1.5 bg-surface-hover rounded-lg appearance-none cursor-pointer accent-static-accent"
            />
          </div>
        </div>

        {/* Order arrangement (if Host and more than 1 member) */}
        {isCurrentUserHost && (canShiftLeft || canShiftRight) && (
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-surface-card border border-surface-border mb-4">
            <span className="text-xs font-mono text-slate-400">Position in Party</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onShiftLeft && onShiftLeft(participant.participantId)}
                disabled={!canShiftLeft}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move earlier"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => onShiftRight && onShiftRight(participant.participantId)}
                disabled={!canShiftRight}
                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                title="Move later"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Host Actions for this participant */}
        {isCurrentUserHost && participant.role !== 'HOST' && (
          <div className="space-y-2 pt-2 border-t border-surface-border">
            {/* Make Host / Transfer */}
            {onTransferHost && (
              <button
                type="button"
                onClick={() => {
                  onTransferHost(participant.participantId);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-medium text-white">Make Host</span>
                </div>
              </button>
            )}

            {/* Kick from Party */}
            {onKickParticipant && (
              <button
                type="button"
                onClick={() => {
                  onKickParticipant(participant.participantId);
                  onClose();
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/25 text-rose-400 transition-colors text-left cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <UserX className="w-4 h-4 text-rose-400" />
                  <span className="text-sm font-medium">Remove from Party</span>
                </div>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

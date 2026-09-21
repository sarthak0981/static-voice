import React from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Crown,
  UserMinus,
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
  onRemoveFromParty,
  onKickParticipant,
  onShiftLeft,
  onShiftRight,
  canShiftLeft = false,
  canShiftRight = false
}) => {
  if (!isOpen || !participant) return null;

  const renderQualityBadge = () => {
    if (!connectionQuality) return null;
    switch (connectionQuality) {
      case 'EXCELLENT':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Excellent
          </span>
        );
      case 'GOOD':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Good
          </span>
        );
      case 'UNSTABLE':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-400">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            Unstable
          </span>
        );
      case 'POOR':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-rose-400">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
            Poor
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-0 sm:p-4 animate-in fade-in duration-200 select-none">
      {/* Dimmed backdrop with blur */}
      <div
        onClick={onClose}
        className="absolute inset-0 bg-black/70 backdrop-blur-md transition-opacity"
      />

      {/* Sheet Container */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Controls for ${participant.displayName}`}
        className="relative w-full max-w-lg bg-[#0E1017] border border-white/10 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 shadow-2xl shadow-black/90 z-10 max-h-[90dvh] overflow-y-auto animate-in slide-in-from-bottom duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Drag handle pill on mobile */}
        <div className="w-12 h-1.5 bg-white/20 rounded-full mx-auto mb-4 sm:hidden" />

        {/* Header: Avatar, Name, and Close Button */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[#181B26] border border-white/10 flex items-center justify-center text-lg font-bold font-mono text-emerald-400">
              {participant.displayName.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-wide truncate max-w-[180px] sm:max-w-[240px]">
                  {participant.displayName}
                </h3>
                {participant.role === 'HOST' && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                    <Crown className="w-3 h-3 text-amber-400" />
                    <span>HOST</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-xs text-[#8A99AD] font-mono">
                  {isCurrentUserHost
                    ? 'Participant Controls • Host Master'
                    : 'Local Playback Volume • Only affects your speaker'}
                </p>
                {renderQualityBadge()}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Section 1: Tactile Volume Slider (0% to 100%) */}
        <div className="py-4 border-b border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-mono text-[#8A99AD] flex items-center gap-1.5">
              {volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-emerald-400" />
              )}
              <span>AUDIO VOLUME</span>
            </span>
            <span className="text-xs font-mono font-bold text-white">
              {volume}%
            </span>
          </div>

          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={volume}
            onChange={(e) => onVolumeChange(participant.participantId, parseInt(e.target.value, 10))}
            className="w-full h-2 bg-[#181B26] rounded-lg appearance-none cursor-pointer accent-[#00E599]"
          />

          {/* Preset Buttons */}
          <div className="flex items-center justify-between gap-2 mt-2">
            <button
              type="button"
              onClick={() => onVolumeChange(participant.participantId, 0)}
              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
            >
              Mute (0%)
            </button>
            <button
              type="button"
              onClick={() => onVolumeChange(participant.participantId, 50)}
              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => onVolumeChange(participant.participantId, 100)}
              className="flex-1 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-[11px] font-mono text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
            >
              100%
            </button>
          </div>
        </div>

        {/* Section 2: Position Shifting (Host Only) */}
        {isCurrentUserHost && (canShiftLeft || canShiftRight) && (
          <div className="py-3 border-b border-white/10">
            <span className="text-xs font-mono text-[#8A99AD] block mb-2">
              SHIFT POSITION ON SCREEN
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canShiftLeft}
                onClick={() => onShiftLeft?.(participant.participantId)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-mono transition-all ${
                  canShiftLeft
                    ? 'bg-white/5 hover:bg-white/10 border-white/10 text-white cursor-pointer active:scale-95'
                    : 'bg-white/2 border-white/5 text-[#4E586E] cursor-not-allowed opacity-40'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Move Left</span>
              </button>

              <button
                type="button"
                disabled={!canShiftRight}
                onClick={() => onShiftRight?.(participant.participantId)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl border text-xs font-mono transition-all ${
                  canShiftRight
                    ? 'bg-white/5 hover:bg-white/10 border-white/10 text-white cursor-pointer active:scale-95'
                    : 'bg-white/2 border-white/5 text-[#4E586E] cursor-not-allowed opacity-40'
                }`}
              >
                <span>Move Right</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Section 3: Large Thumb-Friendly Host Actions (Host Only) */}
        {isCurrentUserHost && onTransferHost && onRemoveFromParty && onKickParticipant && (
          <div className="pt-4 space-y-2.5">
            {/* Transfer Host */}
            <button
              type="button"
              onClick={() => {
                onTransferHost(participant.participantId);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-amber-500/15 border border-white/10 hover:border-amber-500/30 text-xs font-mono font-semibold text-white hover:text-amber-300 transition-all min-h-[48px] cursor-pointer active:scale-[0.98]"
            >
              <Crown className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Make Room Host (Transfer Ownership)</span>
            </button>

            {/* Move Back to Lounge */}
            <button
              type="button"
              onClick={() => {
                onRemoveFromParty(participant.participantId);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono font-semibold text-[#8A99AD] hover:text-white transition-all min-h-[48px] cursor-pointer active:scale-[0.98]"
            >
              <UserMinus className="w-4 h-4 shrink-0" />
              <span>Move Back to Waiting Lounge</span>
            </button>

            {/* Kick from Room */}
            <button
              type="button"
              onClick={() => {
                onKickParticipant(participant.participantId);
                onClose();
              }}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-mono font-semibold text-rose-400 transition-all min-h-[48px] cursor-pointer active:scale-[0.98]"
            >
              <UserX className="w-4 h-4 shrink-0" />
              <span>Kick from Room Completely</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

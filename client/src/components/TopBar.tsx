import React from 'react';
import { Settings, Lock } from 'lucide-react';
import { ConnectionStatus } from '../types/index.js';
import { ConnectionIndicator } from './ui/ConnectionIndicator.js';

interface TopBarProps {
  roomId: string;
  roomName: string;
  isHost: boolean;
  invitationsOpen: boolean;
  connectionStatus: ConnectionStatus;
  onOpenSettingsModal: () => void;
  partyCount?: number;
  partyCapacity?: number;
}

export const TopBar: React.FC<TopBarProps> = ({
  roomId,
  isHost: _isHost,
  invitationsOpen,
  connectionStatus,
  onOpenSettingsModal,
  partyCount = 1,
  partyCapacity = 8
}) => {
  return (
    <header className="w-full pt-[max(1.25rem,env(safe-area-inset-top))] pb-3 px-6 sm:px-12 flex items-start justify-between z-20 shrink-0 select-none">
      {/* Top Left: STATIC & Connection Status */}
      <div className="flex flex-col items-start min-w-0">
        <span className="font-light tracking-[0.35em] text-white text-base sm:text-lg uppercase">
          S T A T I C
        </span>
        <div className="mt-1 flex items-center gap-2.5">
          <ConnectionIndicator status={connectionStatus} />
          {!invitationsOpen && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-amber-300/80">
              <Lock className="w-2.5 h-2.5" />
              <span>Invites Paused</span>
            </span>
          )}
        </div>
      </div>

      {/* Top Right: Room ID, Count & Settings */}
      <div className="flex items-start gap-4 text-right">
        <div className="flex flex-col items-end">
          <span className="font-mono tracking-widest text-xs sm:text-sm text-slate-300">
            {roomId}
          </span>
          <span className="mt-1 font-mono text-xs text-slate-500">
            {partyCount} / {partyCapacity}
          </span>
        </div>

        {/* Settings button */}
        <button
          type="button"
          onClick={onOpenSettingsModal}
          title="Room Settings"
          aria-label="Room Settings"
          className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/5 transition-colors cursor-pointer mt-0.5"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};

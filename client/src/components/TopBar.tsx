import React from 'react';
import { Radio, Settings } from 'lucide-react';
import { ConnectionStatus } from '../types/index.js';

interface TopBarProps {
  roomId: string;
  roomName: string;
  isHost: boolean;
  invitationsOpen: boolean;
  connectionStatus: ConnectionStatus;
  onOpenSettingsModal: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  roomName,
  isHost,
  invitationsOpen,
  connectionStatus,
  onOpenSettingsModal
}) => {

  const renderStatusBadge = () => {
    switch (connectionStatus) {
      case 'CONNECTED':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-static-accent/10 border border-static-accent/20 text-static-accent text-[11px] font-mono tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-static-accent animate-pulse" />
            <span className="hidden sm:inline">CONNECTED</span>
          </span>
        );
      case 'RECONNECTING':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-static-warning/10 border border-static-warning/20 text-static-warning text-[11px] font-mono tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-static-warning animate-ping" />
            <span>RECONNECTING…</span>
          </span>
        );
      case 'CONNECTING':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-elevated border border-surface-border text-static-subtext text-[11px] font-mono tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-static-subtext animate-pulse" />
            <span className="hidden sm:inline">CONNECTING</span>
          </span>
        );
      case 'OFFLINE':
      default:
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-static-danger/10 border border-static-danger/20 text-static-danger text-[11px] font-mono tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-static-danger" />
            <span>OFFLINE</span>
          </span>
        );
    }
  };

  return (
    <header className="w-full pt-[env(safe-area-inset-top)] border-b border-surface-border/60 bg-surface/60 backdrop-blur-md px-3 sm:px-6 flex items-center justify-between z-20 shrink-0 min-h-14">
      {/* Brand & Connection Status */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 pr-2 py-2">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-lg bg-surface-card border border-surface-border flex items-center justify-center">
            <Radio className="w-3.5 h-3.5 text-static-accent" />
          </div>
          <span className="font-mono font-bold tracking-[0.2em] text-white text-sm sm:text-base hidden sm:inline">
            STATIC
          </span>
        </div>

        {renderStatusBadge()}

        <span className="text-xs text-static-muted font-mono truncate hidden md:inline max-w-[180px]">
          / {roomName}
        </span>
      </div>

      {/* Notifications & System Status Center Strip */}
      <div className="flex items-center justify-center gap-2 py-2">
        {!invitationsOpen && (
          <span className="px-2 sm:px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] sm:text-[11px] font-mono tracking-wide flex items-center gap-1.5 shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
            <span className="hidden sm:inline">Invitations paused</span>
            <span className="sm:hidden">Paused</span>
          </span>
        )}
      </div>

      {/* Right: Clean minimal room settings */}
      <div className="flex items-center gap-2 shrink-0 py-2">
        {isHost && (
          <button
            type="button"
            onClick={onOpenSettingsModal}
            title="Room Settings"
            aria-label="Room Settings"
            className="p-2 rounded-lg bg-surface-card hover:bg-surface-hover border border-surface-border text-static-muted hover:text-white transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

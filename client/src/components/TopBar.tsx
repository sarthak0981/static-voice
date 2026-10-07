import React from 'react';
import { Radio, Settings, Circle, Square } from 'lucide-react';
import { ConnectionStatus } from '../types/index.js';
import { isDesktopPC } from '../lib/sessionRecorder.js';

interface TopBarProps {
  roomId: string;
  roomName: string;
  isHost: boolean;
  connectionStatus: ConnectionStatus;
  onOpenSettingsModal: () => void;
  isRecording?: boolean;
  recordingDuration?: number;
  onStartRecording?: () => void;
  onStopRecording?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  roomName,
  isHost,
  connectionStatus,
  onOpenSettingsModal,
  isRecording = false,
  recordingDuration = 0,
  onStartRecording,
  onStopRecording
}) => {
  const [isDesktop, setIsDesktop] = React.useState<boolean>(() => isDesktopPC());

  React.useEffect(() => {
    const handleResize = () => {
      setIsDesktop(isDesktopPC());
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const formatTime = (secs: number = 0) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

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



      {/* Right: Recording controls & room settings */}
      <div className="flex items-center gap-2 shrink-0 py-2">
        {/* Guest Recording Indicator Badge */}
        {!isHost && isRecording && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950/40 border border-rose-500/40 text-rose-300 text-xs font-mono select-none">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
            <span className="font-bold tracking-wider text-rose-400">REC</span>
            <span className="hidden sm:inline text-rose-300/80 text-[11px]">RECORDING</span>
          </div>
        )}

        {/* Host Recording Controls - PC Only */}
        {isHost && (
          <>
            {isRecording ? (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-rose-950/50 border border-rose-500/60 shadow-[0_0_15px_rgba(244,63,94,0.3)] text-rose-300 text-xs font-mono select-none">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
                <span className="font-bold tracking-wider text-rose-400">REC</span>
                <span className="text-white font-medium">{formatTime(recordingDuration)}</span>
                <span className="text-white/40 text-[10px]">/ 05:00</span>
                <button
                  type="button"
                  onClick={onStopRecording}
                  title="Stop and Save Recording"
                  aria-label="Stop Recording"
                  className="ml-0.5 p-1 rounded-md bg-rose-500/20 hover:bg-rose-500/40 text-rose-200 hover:text-white transition-colors cursor-pointer"
                >
                  <Square className="w-3 h-3 fill-current" />
                </button>
              </div>
            ) : isDesktop ? (
              <button
                type="button"
                onClick={onStartRecording}
                title="Record Session (PC only, 1080p 60fps, up to 5 min)"
                aria-label="Start Recording"
                className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 hover:border-rose-500/50 text-rose-400 hover:text-rose-300 text-xs font-mono transition-all duration-150 cursor-pointer active:scale-95 shadow-sm"
              >
                <Circle className="w-3 h-3 fill-rose-500 text-rose-500" />
                <span className="font-semibold">RECORD</span>
              </button>
            ) : null}
          </>
        )}

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

import React from 'react';
import { ConnectionStatus } from '../../types/index.js';

interface ConnectionIndicatorProps {
  status: ConnectionStatus;
  showText?: boolean;
  className?: string;
}

export const ConnectionIndicator: React.FC<ConnectionIndicatorProps> = ({
  status,
  showText = true,
  className = ''
}) => {
  switch (status) {
    case 'CONNECTED':
      return (
        <div className={`inline-flex items-center gap-2 select-none ${className}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.5)]" />
          </span>
          {showText && (
            <span className="text-xs font-mono tracking-wider text-slate-300">
              Connected
            </span>
          )}
        </div>
      );
    case 'RECONNECTING':
      return (
        <div className={`inline-flex items-center gap-2 select-none ${className}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
          </span>
          {showText && (
            <span className="text-xs font-mono tracking-wider text-amber-300">
              Reconnecting…
            </span>
          )}
        </div>
      );
    case 'CONNECTING':
      return (
        <div className={`inline-flex items-center gap-2 select-none ${className}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-slate-400 opacity-40" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-400" />
          </span>
          {showText && (
            <span className="text-xs font-mono tracking-wider text-slate-400">
              Connecting…
            </span>
          )}
        </div>
      );
    case 'OFFLINE':
    default:
      return (
        <div className={`inline-flex items-center gap-2 select-none ${className}`}>
          <span className="inline-flex rounded-full h-2 w-2 bg-rose-500" />
          {showText && (
            <span className="text-xs font-mono tracking-wider text-rose-400">
              Offline
            </span>
          )}
        </div>
      );
  }
};

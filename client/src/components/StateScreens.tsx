import React from 'react';
import { Lock, LogOut, ArrowLeft, Mic, AlertCircle } from 'lucide-react';

interface QueueScreenProps {
  queuePosition?: number;
  onLeaveQueue: () => void;
}

export const QueueScreen: React.FC<QueueScreenProps> = ({ queuePosition = 1, onLeaveQueue }) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-static-atmosphere bg-static-noise text-static-text text-center select-none">
      <div className="w-full max-w-sm flex flex-col items-center">
        <span className="text-[11px] font-mono tracking-[0.25em] text-amber-400 uppercase mb-3">
          Room Full
        </span>

        <h2 className="text-2xl sm:text-3xl font-light text-white tracking-wide mb-2">
          Waiting for a spot
        </h2>

        <p className="text-xs text-slate-400 font-mono mb-8">
          You are <span className="text-white font-semibold">#{queuePosition}</span> in line. You will be admitted automatically.
        </p>

        <button
          type="button"
          onClick={onLeaveQueue}
          className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>LEAVE QUEUE</span>
        </button>
      </div>
    </div>
  );
};

interface InvitationsClosedScreenProps {
  onBack: () => void;
}

export const InvitationsClosedScreen: React.FC<InvitationsClosedScreenProps> = ({ onBack }) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-static-atmosphere bg-static-noise text-static-text text-center select-none">
      <div className="w-full max-w-sm flex flex-col items-center">
        <div className="w-10 h-10 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-slate-400 mb-4">
          <Lock className="w-5 h-5" />
        </div>

        <span className="text-[11px] font-mono tracking-[0.25em] text-slate-400 uppercase mb-2">
          Invitations Paused
        </span>

        <h2 className="text-2xl sm:text-3xl font-light text-white tracking-wide mb-3">
          Room is not accepting guests
        </h2>

        <p className="text-xs text-slate-400 leading-relaxed font-light mb-8 max-w-xs">
          The host has temporarily paused entry to this room. You can return to the home screen.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="px-6 py-2.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono tracking-wider transition-colors flex items-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>RETURN TO STATIC</span>
        </button>
      </div>
    </div>
  );
};

interface MessageScreenProps {
  title: string;
  badge?: string;
  message: string;
  submessage?: string;
  actionText: string;
  onAction: () => void;
  icon?: 'ended' | 'removed' | 'error';
}

export const MessageScreen: React.FC<MessageScreenProps> = ({
  title,
  badge,
  message,
  submessage,
  actionText,
  onAction
}) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 bg-static-atmosphere bg-static-noise text-static-text text-center select-none">
      <div className="w-full max-w-sm flex flex-col items-center">
        {badge && (
          <span className="text-[11px] font-mono tracking-[0.25em] text-slate-500 uppercase mb-3">
            {badge}
          </span>
        )}

        <h2 className="text-2xl sm:text-3xl font-light text-white tracking-wide mb-2">
          {title}
        </h2>

        <p className="text-xs text-slate-400 font-light mb-2 max-w-xs">
          {message}
        </p>

        {submessage && (
          <p className="text-[11px] text-slate-500 font-mono mb-8">
            {submessage}
          </p>
        )}

        <button
          type="button"
          onClick={onAction}
          className="mt-6 px-6 py-2.5 rounded-full bg-white text-black hover:bg-white/90 font-mono text-xs font-semibold tracking-wider transition-all cursor-pointer"
        >
          {actionText}
        </button>
      </div>
    </div>
  );
};

interface MicPromptBannerProps {
  onEnableMic: () => void;
  isDenied?: boolean;
}

export const MicPromptBanner: React.FC<MicPromptBannerProps> = ({ onEnableMic, isDenied = false }) => {
  return (
    <div className="w-full bg-surface-elevated/90 border-b border-surface-border px-4 py-2 flex items-center justify-between text-xs z-30 select-none">
      <div className="flex items-center gap-2 text-slate-300">
        {isDenied ? (
          <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <Mic className="w-3.5 h-3.5 text-static-accentLight" />
        )}
        <span>
          {isDenied
            ? 'Microphone blocked. Please grant access in your browser settings.'
            : 'Microphone is currently uninitialized.'}
        </span>
      </div>

      {!isDenied && (
        <button
          type="button"
          onClick={onEnableMic}
          className="px-3 py-1 rounded bg-white text-black font-mono text-xs font-semibold hover:bg-white/90 cursor-pointer"
        >
          ENABLE
        </button>
      )}
    </div>
  );
};

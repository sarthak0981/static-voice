import { Clock, Lock, LogOut, ArrowLeft, Mic } from 'lucide-react';

interface QueueScreenProps {
  queuePosition?: number;
  onLeaveQueue: () => void;
}

export const QueueScreen: React.FC<QueueScreenProps> = ({ queuePosition = 1, onLeaveQueue }) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-background bg-static-noise text-static-text text-center">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-surface border border-surface-border shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-5 sm:mb-6">
          <Clock className="w-7 h-7 sm:w-8 sm:h-8 animate-pulse" />
        </div>

        <span className="text-xs uppercase font-mono tracking-widest text-static-muted mb-2">
          ROOM FULL
        </span>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3 leading-snug">
          The room is full, wait man! 😅
        </h2>

        <div className="my-5 sm:my-6 px-4 sm:px-6 py-3.5 sm:py-4 rounded-2xl bg-surface-card border border-surface-border w-full">
          <span className="block text-xl sm:text-2xl font-mono font-bold text-static-accent mb-1">
            You're #{queuePosition} in line
          </span>
          <span className="text-xs text-static-subtext">
            We'll let you in when a spot opens.
          </span>
        </div>

        <button
          type="button"
          onClick={onLeaveQueue}
          className="w-full py-3.5 px-5 min-h-[44px] rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-mono tracking-wider font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
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
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-background bg-static-noise text-static-text text-center">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-surface border border-surface-border shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-static-warning/10 border border-static-warning/20 text-static-warning flex items-center justify-center mb-5 sm:mb-6">
          <Lock className="w-7 h-7 sm:w-8 sm:h-8" />
        </div>

        <span className="text-xs uppercase font-mono tracking-widest text-static-muted mb-2">
          INVITATIONS CLOSED
        </span>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">
          The invitations are closed 😊
        </h2>

        <p className="text-xs sm:text-sm text-static-subtext mb-6 sm:mb-8">
          The host has temporarily paused new entries. Ask the host to reopen the room.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 px-5 min-h-[44px] rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-mono tracking-wider font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>BACK TO STATIC</span>
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
  onAction,
  icon = 'ended'
}) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-background bg-static-noise text-static-text text-center">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-surface border border-surface-border shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200">
        <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-surface-card border border-surface-border text-static-accent flex items-center justify-center mb-5 sm:mb-6 text-2xl">
          {icon === 'ended' ? '👋' : icon === 'removed' ? '🚪' : '⚠️'}
        </div>

        {badge && (
          <span className="text-xs uppercase font-mono tracking-widest text-static-muted mb-2">
            {badge}
          </span>
        )}

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">
          {title}
        </h2>

        <p className="text-sm sm:text-base text-white font-medium mb-2">
          {message}
        </p>

        {submessage && (
          <p className="text-xs text-static-subtext mb-6 sm:mb-8">
            {submessage}
          </p>
        )}

        <button
          type="button"
          onClick={onAction}
          className="w-full py-3.5 px-5 mt-2 sm:mt-4 min-h-[44px] rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-mono tracking-wider font-semibold transition-colors cursor-pointer"
        >
          {actionText}
        </button>
      </div>
    </div>
  );
};

interface MicPromptBannerProps {
  onEnableMic: () => void;
  isDenied: boolean;
}

export const MicPromptBanner: React.FC<MicPromptBannerProps> = ({ onEnableMic, isDenied }) => {
  return (
    <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-surface-elevated border-b border-surface-border flex items-center justify-between gap-2.5 sm:gap-4 text-[11px] sm:text-xs font-sans animate-in slide-in-from-top duration-200">
      <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
        <div className="p-1.5 rounded-lg bg-static-accent/15 text-static-accent shrink-0">
          <Mic className="w-4 h-4" />
        </div>
        <span className="text-static-text truncate sm:whitespace-normal">
          {isDenied
            ? "Microphone access blocked. Check permissions."
            : 'Enable microphone to talk in party.'}
        </span>
      </div>

      <button
        type="button"
        onClick={onEnableMic}
        className="px-3 sm:px-3.5 py-1.5 min-h-[38px] rounded-lg bg-static-accent text-background font-mono font-semibold text-[11px] sm:text-xs hover:bg-static-accent/90 transition-colors cursor-pointer shrink-0"
      >
        {isDenied ? 'RETRY' : 'ENABLE MIC'}
      </button>
    </div>
  );
};

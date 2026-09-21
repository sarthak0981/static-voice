import { Clock, Lock, LogOut, ArrowLeft, Mic, UserX, AlertTriangle } from 'lucide-react';

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
          WAITING IN LINE
        </span>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3 leading-snug">
          Room is currently full
        </h2>

        <div className="my-5 sm:my-6 px-4 sm:px-6 py-3.5 sm:py-4 rounded-2xl bg-surface-card border border-surface-border w-full">
          <span className="block text-xl sm:text-2xl font-mono font-bold text-static-accent mb-1">
            You're #{queuePosition} in line
          </span>
          <span className="text-xs text-static-subtext">
            You will be admitted automatically when a spot opens.
          </span>
        </div>

        <button
          type="button"
          onClick={onLeaveQueue}
          className="w-full py-3.5 px-5 min-h-[44px] rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-mono tracking-wider font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Leave Queue</span>
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
          INVITATIONS PAUSED
        </span>

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">
          Invitations are paused
        </h2>

        <p className="text-xs sm:text-sm text-static-subtext mb-6 sm:mb-8">
          The host is not accepting new guests right now.
        </p>

        <button
          type="button"
          onClick={onBack}
          className="w-full py-3.5 px-5 min-h-[44px] rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-sm font-mono tracking-wider font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Home</span>
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
  icon?: 'ended' | 'removed' | 'error' | 'clock';
  clockInText?: string;
}

export const MessageScreen: React.FC<MessageScreenProps> = ({
  title,
  badge,
  message,
  submessage,
  actionText,
  onAction,
  icon = 'ended',
  clockInText
}) => {
  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 sm:p-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-background bg-static-noise text-static-text text-center">
      <div className="w-full max-w-md p-6 sm:p-8 rounded-3xl bg-surface border border-surface-border shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200">
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border flex items-center justify-center mb-5 sm:mb-6 ${
          icon === 'clock'
            ? 'bg-amber-500/10 border-amber-500/25 text-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.15)]'
            : 'bg-surface-card border-surface-border'
        }`}>
          {icon === 'clock' ? (
            <Clock className="w-7 h-7 sm:w-8 sm:h-8 text-amber-400 animate-pulse" />
          ) : icon === 'ended' ? (
            <LogOut className="w-7 h-7 text-[#8A99AD]" />
          ) : icon === 'removed' ? (
            <UserX className="w-7 h-7 text-rose-400" />
          ) : (
            <AlertTriangle className="w-7 h-7 text-amber-400" />
          )}
        </div>

        {badge && (
          <span className="text-xs uppercase font-mono tracking-widest text-static-muted mb-2">
            {badge}
          </span>
        )}

        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2 sm:mb-3">
          {title}
        </h2>

        {clockInText ? (
          <div className="my-3 px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-400/30 text-amber-200 flex items-center justify-center gap-2 font-mono text-sm sm:text-base font-semibold shadow-[0_0_16px_rgba(251,191,36,0.12)]">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{clockInText}</span>
          </div>
        ) : (
          <p className="text-sm sm:text-base text-white font-medium mb-2">
            {message}
          </p>
        )}

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

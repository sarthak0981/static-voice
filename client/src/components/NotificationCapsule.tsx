import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Sparkles, LogOut, Info, AlertTriangle, Check, Crown } from 'lucide-react';

export interface NotificationItem {
  id: string;
  message: string;
  type?: 'info' | 'leave' | 'join' | 'alert' | 'success' | 'action' | 'host';
  icon?: 'leave' | 'join' | 'volume' | 'alert' | 'success' | 'info' | 'host';
  actionText?: string;
  onAction?: () => void;
  durationMs?: number;
}

interface NotificationCapsuleProps {
  queue: NotificationItem[];
  onDismissCurrent: () => void;
}

export const NotificationCapsule: React.FC<NotificationCapsuleProps> = ({
  queue,
  onDismissCurrent
}) => {
  const currentItem = queue[0] || null;
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const onDismissRef = useRef(onDismissCurrent);
  onDismissRef.current = onDismissCurrent;

  useEffect(() => {
    if (!currentItem) {
      setIsEntering(false);
      setIsExiting(false);
      return;
    }

    // Trigger smooth enter
    setIsEntering(true);
    setIsExiting(false);

    const enterTimer = setTimeout(() => {
      setIsEntering(false);
    }, 40);

    const duration = currentItem.durationMs || 2800;
    const exitTimer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => {
        setIsExiting(false);
        onDismissRef.current();
      }, 250);
    }, duration);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
    };
  }, [currentItem?.id]);

  if (!currentItem) return null;

  const handleClick = () => {
    if (currentItem.onAction) {
      currentItem.onAction();
    }
    setIsExiting(true);
    setTimeout(() => {
      setIsExiting(false);
      onDismissRef.current();
    }, 200);
  };

  const renderIcon = () => {
    switch (currentItem.icon) {
      case 'host':
        return <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400/20 shrink-0" />;
      case 'leave':
        return <LogOut className="w-3.5 h-3.5 text-rose-400 shrink-0" />;
      case 'join':
        return <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'volume':
        return <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />;
      case 'alert':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'success':
        return <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      default:
        return <Info className="w-3.5 h-3.5 text-[#8A99AD] shrink-0" />;
    }
  };

  const isHostNotification = currentItem.type === 'host';

  return (
    <aside
      aria-label="Notification Banner"
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[calc(100vw-2rem)]"
    >
      <div
        role="status"
        aria-live="polite"
        onClick={handleClick}
        className={`pointer-events-auto inline-flex items-center gap-2.5 px-4 py-2 rounded-full shadow-2xl shadow-black/80 backdrop-blur-xl text-white text-xs font-mono select-none cursor-pointer transition-all duration-250 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isHostNotification
            ? 'bg-[#0D0F16]/95 border border-amber-400/70 shadow-[0_0_22px_rgba(251,191,36,0.22)] hover:border-amber-400 hover:shadow-[0_0_28px_rgba(251,191,36,0.3)]'
            : 'bg-[#0D0F16]/95 border border-white/10 hover:border-white/20'
        } ${
          isEntering
            ? 'opacity-0 -translate-y-4 scale-95'
            : isExiting
            ? 'opacity-0 -translate-y-4 scale-95'
            : 'opacity-100 translate-y-0 scale-100'
        } ${currentItem.type === 'action' ? 'hover:border-amber-400/40 hover:bg-[#141722]' : ''}`}
      >
        {renderIcon()}

        <span className={`truncate max-w-[280px] sm:max-w-[420px] tracking-wide ${isHostNotification ? 'text-amber-200 font-semibold' : 'text-neutral-200'}`}>
          {currentItem.message}
        </span>

        {currentItem.actionText && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold tracking-wider shrink-0 uppercase">
            {currentItem.actionText}
          </span>
        )}
      </div>
    </aside>
  );
};

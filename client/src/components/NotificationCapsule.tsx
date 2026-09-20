import React, { useState, useEffect, useRef } from 'react';
import { Volume2, Sparkles, LogOut, Info, AlertTriangle, Check } from 'lucide-react';

export interface NotificationItem {
  id: string;
  message: string;
  type?: 'info' | 'leave' | 'join' | 'alert' | 'success' | 'action';
  icon?: 'leave' | 'join' | 'volume' | 'alert' | 'success' | 'info';
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
  const [activeItem, setActiveItem] = useState<NotificationItem | null>(null);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // If no active notification and there are items in the queue, pop the first one
    if (!activeItem && queue.length > 0 && !isExiting) {
      const nextItem = queue[0];
      setActiveItem(nextItem);
      setIsEntering(true);
      setIsExiting(false);

      // Trigger entrance spring
      const enterTimer = setTimeout(() => {
        setIsEntering(false);
      }, 50);

      // Set display duration (default 2600ms, or item's durationMs)
      const duration = nextItem.durationMs || 2600;
      timerRef.current = setTimeout(() => {
        // Start smooth exit animation
        setIsExiting(true);
        setTimeout(() => {
          setActiveItem(null);
          setIsExiting(false);
          onDismissCurrent();
        }, 300); // match exit transition duration
      }, duration);

      return () => {
        clearTimeout(enterTimer);
        if (timerRef.current) clearTimeout(timerRef.current);
      };
    }
  }, [queue, activeItem, isExiting, onDismissCurrent]);

  if (!activeItem) return null;

  const handleClick = () => {
    if (activeItem.onAction) {
      activeItem.onAction();
    }
    // Dismiss early on tap
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsExiting(true);
    setTimeout(() => {
      setActiveItem(null);
      setIsExiting(false);
      onDismissCurrent();
    }, 250);
  };

  const renderIcon = () => {
    switch (activeItem.icon) {
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

  return (
    <aside
      aria-label="Notification Banner"
      className="fixed top-[max(0.75rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 pointer-events-none max-w-[calc(100vw-2rem)]"
    >
      <div
        role="status"
        aria-live="polite"
        onClick={handleClick}
        className={`pointer-events-auto inline-flex items-center gap-2.5 px-4 py-2 rounded-full bg-[#0D0F16]/95 border border-white/10 shadow-2xl shadow-black/80 backdrop-blur-xl text-white text-xs font-mono select-none cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          isEntering
            ? 'opacity-0 -translate-y-4 scale-95'
            : isExiting
            ? 'opacity-0 -translate-y-4 scale-95'
            : 'opacity-100 translate-y-0 scale-100'
        } ${activeItem.type === 'action' ? 'hover:border-amber-400/40 hover:bg-[#141722]' : 'hover:border-white/20'}`}
      >
        {renderIcon()}

        <span className="truncate max-w-[280px] sm:max-w-[420px] tracking-wide text-neutral-200">
          {activeItem.message}
        </span>

        {activeItem.actionText && (
          <span className="px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-bold tracking-wider shrink-0 uppercase">
            {activeItem.actionText}
          </span>
        )}
      </div>
    </aside>
  );
};

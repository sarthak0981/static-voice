import React, { useEffect } from 'react';
import { Crown } from 'lucide-react';

interface HostPromotedModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HostPromotedModal: React.FC<HostPromotedModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 4200);
      return () => clearTimeout(timer);
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed top-[max(1.5rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 max-w-[calc(100vw-2rem)] flex items-center gap-3 px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl bg-[#12141C]/95 border border-amber-400/60 shadow-[0_0_30px_rgba(251,191,36,0.25)] backdrop-blur-md cursor-pointer animate-toast-in transition-all duration-300 hover:scale-105"
      role="status"
      aria-live="polite"
    >
      <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
        <Crown className="w-4 h-4 fill-amber-400 text-amber-400 animate-pulse" />
      </div>

      <div className="flex flex-col text-left">
        <span className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
          You are now the host! 👑
        </span>
        <span className="text-[11px] font-mono text-amber-300/80">
          Master party & lounge controls unlocked
        </span>
      </div>
    </div>
  );
};


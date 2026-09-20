import React, { useState, useEffect } from 'react';
import { LogOut, Clock, Shield } from 'lucide-react';

interface ZenLoungeViewProps {
  displayName: string;
  partyName: string;
  roomCode: string;
  onLeaveRoom: () => void;
}

export const ZenLoungeView: React.FC<ZenLoungeViewProps> = ({
  displayName,
  partyName,
  roomCode: _roomCode,
  onLeaveRoom,
}) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center justify-between px-4 sm:px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] bg-[#07080B] text-white selection:bg-[#00E599]/30 select-none overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] sm:w-[480px] h-[340px] sm:h-[480px] bg-[#00E599]/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Top minimal header */}
      <header className="w-full max-w-2xl flex items-center justify-between z-10">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-2.5 h-2.5 rounded-full bg-[#00E599] animate-pulse" />
          <span className="text-xs font-mono tracking-widest text-[#8A99AD] uppercase">
            STATIC &bull; LOUNGE
          </span>
        </div>

        <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#12141C]/80 border border-white/5 text-xs text-[#8A99AD] font-mono">
          <Shield className="w-3.5 h-3.5 text-[#00E599]/70" />
          <span>Secured Lounge</span>
        </div>
      </header>

      {/* Center Zen Stage */}
      <main className="flex-1 flex flex-col items-center justify-center text-center z-10 my-6 sm:my-8">
        {/* Breathing meditation orb */}
        <div className="relative flex items-center justify-center w-40 h-40 sm:w-56 sm:h-56 mb-8 sm:mb-10">
          {/* Outer ripples */}
          <div className="absolute inset-0 rounded-full border border-[#00E599]/20 animate-zen-ring pointer-events-none" />
          <div
            className="absolute inset-3 sm:inset-4 rounded-full border border-[#00E599]/15 animate-zen-ring pointer-events-none"
            style={{ animationDelay: '2.5s' }}
          />

          {/* Central breathing orb */}
          <div className="w-32 h-32 sm:w-44 sm:h-44 rounded-full bg-gradient-to-tr from-[#00E599]/15 to-[#00E599]/5 border border-[#00E599]/30 flex flex-col items-center justify-center backdrop-blur-md animate-zen-breathe shadow-[0_0_50px_rgba(0,229,153,0.15)]">
            <Clock className="w-5 h-5 sm:w-6 sm:h-6 text-[#00E599] mb-1 opacity-90" />
            <span className="font-mono text-lg sm:text-2xl font-light text-white tracking-widest">
              {formatTime(elapsedSeconds)}
            </span>
            <span className="text-[9px] sm:text-[10px] uppercase font-mono tracking-wider text-[#8A99AD] mt-0.5">
              Elapsed
            </span>
          </div>
        </div>

        {/* Minimal calming status text */}
        <div className="space-y-2 sm:space-y-3 max-w-sm px-4">
          <h2 className="text-xl sm:text-2xl font-normal tracking-wide text-white/95">
            Waiting for Host
          </h2>
          <p className="text-xs sm:text-sm text-[#8A99AD] leading-relaxed font-light">
            You are in the waiting lounge for{' '}
            <span className="text-white font-medium">{partyName}</span>.
            Take a breath, the host will let you in shortly.
          </p>
        </div>

        {/* User identification badge */}
        <div className="mt-5 sm:mt-6 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#12141C] border border-white/10 text-xs font-mono text-[#8A99AD]">
          <span>Joined as</span>
          <span className="text-[#00E599] font-medium truncate max-w-[150px]">{displayName}</span>
        </div>
      </main>

      {/* Bottom controls */}
      <footer className="w-full max-w-md flex flex-col items-center gap-2.5 sm:gap-3 z-10">
        <button
          onClick={onLeaveRoom}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-white/5 hover:bg-rose-500/10 border border-white/10 hover:border-rose-500/30 text-xs font-mono text-[#8A99AD] hover:text-rose-400 transition-all duration-300 active:scale-95 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>LEAVE WAITING ROOM</span>
        </button>

        <p className="text-[10px] sm:text-[11px] text-[#4E586E] font-mono tracking-wide text-center">
          Audio and microphone remain inactive while in lounge
        </p>
      </footer>
    </div>
  );
};

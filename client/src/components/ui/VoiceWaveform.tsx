import React from 'react';

interface VoiceWaveformProps {
  isSpeaking: boolean;
  isMuted?: boolean;
  isDisconnected?: boolean;
  className?: string;
}

export const VoiceWaveform: React.FC<VoiceWaveformProps> = ({
  isSpeaking,
  isMuted = false,
  isDisconnected = false,
  className = ''
}) => {
  if (isDisconnected) {
    return (
      <div
        className={`flex items-center gap-1 opacity-40 select-none ${className}`}
        aria-label="Disconnected"
      >
        <span className="w-8 h-px bg-rose-500/50 border-b border-dashed border-rose-500" />
      </div>
    );
  }

  if (isMuted) {
    return (
      <div
        className={`flex items-center gap-1 select-none text-[10px] font-mono tracking-wider text-slate-500 ${className}`}
        aria-label="Muted"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
        <span className="text-slate-500 text-[10px] tracking-widest uppercase">muted</span>
      </div>
    );
  }

  if (!isSpeaking) {
    // Elegant quiet baseline: ─────
    return (
      <div
        className={`flex items-center gap-0.5 select-none transition-opacity duration-300 opacity-35 ${className}`}
        aria-label="Silent"
      >
        <span className="w-1.5 h-[2px] rounded-full bg-slate-400" />
        <span className="w-1.5 h-[2px] rounded-full bg-slate-400" />
        <span className="w-2.5 h-[2px] rounded-full bg-slate-400" />
        <span className="w-1.5 h-[2px] rounded-full bg-slate-400" />
        <span className="w-1.5 h-[2px] rounded-full bg-slate-400" />
      </div>
    );
  }

  // Active speaking waveform: ▂▅▇▅▂
  return (
    <div
      className={`flex items-center gap-1 select-none transition-all duration-200 ${className}`}
      aria-label="Speaking"
    >
      <span
        className="w-[2.5px] rounded-full bg-static-accent animate-speaking-wave shadow-[0_0_8px_rgba(139,92,246,0.6)]"
        style={{ height: '8px', animationDelay: '0.05s', animationDuration: '0.65s' }}
      />
      <span
        className="w-[2.5px] rounded-full bg-static-accentLight animate-speaking-wave shadow-[0_0_8px_rgba(139,92,246,0.6)]"
        style={{ height: '14px', animationDelay: '0.18s', animationDuration: '0.55s' }}
      />
      <span
        className="w-[2.5px] rounded-full bg-white animate-speaking-wave shadow-[0_0_10px_rgba(255,255,255,0.7)]"
        style={{ height: '18px', animationDelay: '0.1s', animationDuration: '0.6s' }}
      />
      <span
        className="w-[2.5px] rounded-full bg-static-accentLight animate-speaking-wave shadow-[0_0_8px_rgba(139,92,246,0.6)]"
        style={{ height: '13px', animationDelay: '0.24s', animationDuration: '0.58s' }}
      />
      <span
        className="w-[2.5px] rounded-full bg-static-accent animate-speaking-wave shadow-[0_0_8px_rgba(139,92,246,0.6)]"
        style={{ height: '7px', animationDelay: '0.12s', animationDuration: '0.62s' }}
      />
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  PhoneOff,
  Volume2,
  VolumeX,
  MessageSquare,
  Shield,
  Loader2,
  AlertCircle,
  X
} from 'lucide-react';
import { MicrophoneState, ChatMessage } from '../types/index.js';

interface ControlBarProps {
  microphoneState: MicrophoneState;
  isInParty: boolean;
  isHost: boolean;
  loungeCount: number;
  unreadChatCount: number;
  latestChatMessage?: ChatMessage | null;
  isChatOpen: boolean;
  onToggleMicrophone: () => void;
  onLeaveRoom: () => void;
  onToggleChat: () => void;
  onOpenHostControls?: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  microphoneState,
  isInParty,
  isHost,
  loungeCount,
  unreadChatCount,
  latestChatMessage,
  isChatOpen,
  onToggleMicrophone,
  onLeaveRoom,
  onToggleChat,
  onOpenHostControls
}) => {
  const [showChatPopup, setShowChatPopup] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);

  // Trigger popup when a new message arrives while chat is closed
  useEffect(() => {
    if (latestChatMessage && !isChatOpen) {
      setShowChatPopup(true);
      const timer = setTimeout(() => setShowChatPopup(false), 4500);
      return () => clearTimeout(timer);
    } else {
      setShowChatPopup(false);
    }
  }, [latestChatMessage, isChatOpen]);

  const isMicLive = microphoneState === 'ON';
  const isMicMuted = microphoneState === 'MUTED';
  const isMicConnecting = microphoneState === 'CONNECTING';
  const isMicDenied = microphoneState === 'DENIED';

  const handleToggleSpeaker = () => {
    setIsDeafened((prev) => !prev);
  };

  return (
    <nav
      aria-label="Voice Controls"
      className="fixed bottom-[max(1.25rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 pointer-events-auto select-none px-2"
    >
      {/* Floating Chat Message Preview Popup */}
      <div
        onClick={onToggleChat}
        className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 w-72 max-w-[calc(100vw-2rem)] p-3 rounded-2xl notch-hud border border-white/10 shadow-2xl flex items-center gap-2.5 cursor-pointer transition-all duration-200 ease-out ${
          showChatPopup && latestChatMessage && !isChatOpen
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-2 scale-95 pointer-events-none'
        }`}
      >
        <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center text-white shrink-0">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col min-w-0 pr-1 flex-1 text-left">
          <span className="text-[11px] font-mono font-medium text-white truncate">
            {latestChatMessage?.senderName}
          </span>
          <span className="text-xs text-slate-400 truncate">
            {latestChatMessage?.text}
          </span>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowChatPopup(false);
          }}
          aria-label="Dismiss chat preview"
          className="p-1 text-slate-500 hover:text-white transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Pill HUD: Mute, Speaker, Leave + Host/Chat */}
      <div className="notch-hud rounded-full px-3 py-2 flex items-center gap-2 sm:gap-3 text-white shadow-2xl">
        {/* 1. Primary Control: Mute / Unmute */}
        {isInParty && (
          <button
            type="button"
            onClick={onToggleMicrophone}
            disabled={isMicConnecting}
            aria-label={isMicLive ? 'Mute' : 'Unmute'}
            title={isMicLive ? 'Mute microphone' : 'Unmute microphone'}
            className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-180 cursor-pointer active:scale-95 ${
              isMicLive
                ? 'bg-white text-black hover:bg-white/90 shadow-[0_0_16px_rgba(255,255,255,0.3)]'
                : isMicMuted
                ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30 hover:bg-rose-500/25'
                : isMicDenied
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
          >
            {isMicConnecting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isMicLive ? (
              <Mic className="w-5 h-5" />
            ) : isMicMuted ? (
              <MicOff className="w-5 h-5" />
            ) : isMicDenied ? (
              <AlertCircle className="w-5 h-5" />
            ) : (
              <Mic className="w-5 h-5" />
            )}
          </button>
        )}

        {/* 2. Primary Control: Speaker / Audio Output */}
        <button
          type="button"
          onClick={handleToggleSpeaker}
          aria-label={isDeafened ? 'Audio Muted' : 'Audio On'}
          title={isDeafened ? 'Audio Muted' : 'Speaker active'}
          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-180 cursor-pointer active:scale-95 border ${
            isDeafened
              ? 'bg-rose-500/15 text-rose-400 border-rose-500/30 hover:bg-rose-500/25'
              : 'bg-white/5 text-slate-300 border-white/10 hover:text-white hover:bg-white/10'
          }`}
        >
          {isDeafened ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </button>

        {/* 3. Primary Control: Leave (Visually Distinct & Destructive) */}
        <button
          type="button"
          onClick={onLeaveRoom}
          aria-label="Leave Room"
          title="Leave Room"
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-rose-500/15 hover:bg-rose-500 text-rose-400 hover:text-white border border-rose-500/30 transition-all duration-180 cursor-pointer active:scale-95 shadow-sm"
        >
          <PhoneOff className="w-5 h-5" />
        </button>

        {/* Divider */}
        <div className="h-5 w-px bg-white/10 mx-0.5" />

        {/* 4. Chat Toggle */}
        <button
          type="button"
          onClick={onToggleChat}
          aria-label="Party Chat"
          title="Party Chat"
          className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border transition-all duration-180 cursor-pointer active:scale-95 ${
            isChatOpen
              ? 'bg-white/20 border-white/30 text-white'
              : 'bg-transparent border-transparent text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MessageSquare className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          {unreadChatCount > 0 && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-static-accent animate-pulse" />
          )}
        </button>

        {/* 5. Host Controls Sheet Trigger (Host Only) */}
        {isHost && (
          <button
            type="button"
            onClick={onOpenHostControls}
            aria-label="Host Controls"
            title="Host Controls"
            className="relative w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 transition-all duration-180 cursor-pointer active:scale-95"
          >
            <Shield className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
            {loungeCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 py-0.2 rounded-full bg-amber-400 text-black text-[9px] font-bold font-mono">
                {loungeCount}
              </span>
            )}
          </button>
        )}
      </div>
    </nav>
  );
};

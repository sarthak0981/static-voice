import React, { useEffect, useState } from 'react';
import {
  Mic,
  MicOff,
  LogOut,
  Users,
  Share2,
  Loader2,
  AlertCircle,
  MessageSquare,
  Crown,
  X,
  Lock,
  Unlock
} from 'lucide-react';
import { MicrophoneState, ChatMessage } from '../types/index.js';

interface ControlBarProps {
  microphoneState: MicrophoneState;
  isInParty: boolean;
  isHost: boolean;
  loungeCount: number;
  isLoungeCollapsed: boolean;
  onToggleLoungeCollapse: () => void;
  invitationsOpen: boolean;
  onToggleInvitations: (open: boolean) => void;
  unreadChatCount: number;
  latestChatMessage?: ChatMessage | null;
  isChatOpen: boolean;
  onToggleMicrophone: () => void;
  onLeaveRoom: () => void;
  onPromptEndRoom?: () => void;
  onToggleChat: () => void;
  onOpenShareModal: () => void;
}

export const ControlBar: React.FC<ControlBarProps> = ({
  microphoneState,
  isInParty,
  isHost,
  loungeCount,
  isLoungeCollapsed,
  onToggleLoungeCollapse,
  invitationsOpen,
  onToggleInvitations,
  unreadChatCount,
  latestChatMessage,
  isChatOpen,
  onToggleMicrophone,
  onLeaveRoom,
  onPromptEndRoom,
  onToggleChat,
  onOpenShareModal
}) => {
  const [showChatPopup, setShowChatPopup] = useState(false);

  // Trigger popup when a new message arrives while chat is closed
  useEffect(() => {
    if (latestChatMessage && !isChatOpen) {
      setShowChatPopup(true);
      const timer = setTimeout(() => setShowChatPopup(false), 5000);
      return () => clearTimeout(timer);
    } else {
      setShowChatPopup(false);
    }
  }, [latestChatMessage, isChatOpen]);

  const isMicLive = microphoneState === 'ON';
  const isMicMuted = microphoneState === 'MUTED';
  const isMicConnecting = microphoneState === 'CONNECTING';
  const isMicDenied = microphoneState === 'DENIED';

  return (
    <nav
      aria-label="Room Controls Notch"
      className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-40 max-w-[calc(100vw-1rem)] pointer-events-auto select-none px-1"
    >
      {/* Floating Chat Message Preview Popup directly above notch */}
      <div
        onClick={onToggleChat}
        className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-50 w-72 max-w-[calc(100vw-2rem)] sm:w-80 p-3 rounded-2xl notch-hud border border-[#00E599]/40 shadow-2xl flex items-center gap-2.5 cursor-pointer transition-all duration-300 ease-out group ${
          showChatPopup && latestChatMessage && !isChatOpen
            ? 'opacity-100 translate-y-0 scale-100 pointer-events-auto'
            : 'opacity-0 translate-y-3 scale-95 pointer-events-none'
        }`}
      >
        <div className="w-7 h-7 rounded-lg bg-[#00E599]/15 flex items-center justify-center text-[#00E599] shrink-0">
          <MessageSquare className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col min-w-0 pr-1 flex-1">
          <div className="flex items-center gap-1">
            {latestChatMessage?.isHost && (
              <Crown className="w-3 h-3 text-amber-400 shrink-0" />
            )}
            <span className="text-[11px] font-mono font-bold text-white truncate">
              {latestChatMessage?.senderName}
            </span>
          </div>
          <span className="text-xs text-[#8A99AD] truncate">
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
          className="p-1 text-[#8A99AD] hover:text-white transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Floating Notch Capsule */}
      <div className="notch-hud rounded-full px-2 sm:px-4 py-1.5 sm:py-2 flex items-center gap-1 sm:gap-2 text-white shadow-2xl">
        {/* 1. Microphone Action Button */}
        {isInParty && (
          <button
            type="button"
            onClick={onToggleMicrophone}
            disabled={isMicConnecting}
            aria-label={isMicLive ? 'Mute Microphone' : 'Unmute Microphone'}
            className={`flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 min-h-[40px] min-w-[40px] rounded-full font-mono text-xs font-semibold tracking-wider transition-all duration-200 cursor-pointer active:scale-95 shadow-sm ${
              isMicLive
                ? 'bg-[#00E599] text-black hover:bg-[#00E599]/90 font-bold shadow-[0_0_18px_rgba(0,229,153,0.35)]'
                : isMicMuted
                ? 'bg-rose-500/15 border border-rose-500/35 text-rose-400 hover:bg-rose-500/25'
                : isMicDenied
                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40'
                : 'bg-white/5 text-white/80 border border-white/10 hover:bg-white/10'
            }`}
          >
            {isMicConnecting ? (
              <>
                <Loader2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 animate-spin" />
                <span className="hidden sm:inline">SYNCING</span>
              </>
            ) : isMicLive ? (
              <>
                <Mic className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">MIC ON</span>
              </>
            ) : isMicMuted ? (
              <>
                <MicOff className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">MUTED</span>
              </>
            ) : isMicDenied ? (
              <>
                <AlertCircle className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                <span className="hidden sm:inline">BLOCKED</span>
              </>
            ) : (
              <>
                <Mic className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#8A99AD]" />
                <span className="hidden sm:inline">ENABLE</span>
              </>
            )}
          </button>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* 2. In-Party Text Chat Toggle */}
        {isInParty && (
          <button
            type="button"
            onClick={onToggleChat}
            aria-label="Toggle Party Chat"
            title="Party Chat"
            className={`relative p-2 sm:px-3 sm:py-2 min-h-[40px] min-w-[40px] rounded-full border transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
              isChatOpen
                ? 'bg-[#00E599] text-black border-[#00E599] font-bold shadow-[0_0_14px_rgba(0,229,153,0.3)]'
                : 'bg-white/5 border-white/10 text-white hover:bg-white/10'
            }`}
          >
            <MessageSquare className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden md:inline text-xs font-mono">CHAT</span>
            {unreadChatCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#00E599] text-black text-[10px] font-bold font-mono animate-pulse">
                {unreadChatCount}
              </span>
            )}
          </button>
        )}

        {/* 3. Host Lounge Controls (Host Only) */}
        {isHost && (
          <button
            type="button"
            onClick={onToggleLoungeCollapse}
            aria-label={isLoungeCollapsed ? 'Show Lounge' : 'Hide Lounge'}
            title={isLoungeCollapsed ? 'Unhide Lounge Drawer' : 'Hide Lounge Drawer'}
            className={`relative p-2 sm:px-3 sm:py-2 min-h-[40px] min-w-[40px] rounded-full border transition-all duration-200 cursor-pointer flex items-center justify-center gap-1.5 ${
              !isLoungeCollapsed
                ? 'bg-white/20 border-[#00E599]/50 text-white shadow-sm'
                : 'bg-white/5 border-white/10 text-[#8A99AD] hover:text-white hover:bg-white/10'
            }`}
          >
            <Users className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span className="hidden md:inline text-xs font-mono">LOUNGE</span>
            {loungeCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-[#00E599]/25 text-[#00E599] text-[10px] font-bold font-mono">
                {loungeCount}
              </span>
            )}
          </button>
        )}

        {/* 4. Host Stop/Reopen Invitations (Host Only) */}
        {isHost && (
          <button
            type="button"
            onClick={() => onToggleInvitations(!invitationsOpen)}
            title={invitationsOpen ? 'Stop new guests from joining' : 'Reopen invitations'}
            aria-label={invitationsOpen ? 'Stop Invitations' : 'Reopen Invitations'}
            className={`p-2 sm:px-2.5 sm:py-2 min-h-[40px] min-w-[40px] rounded-full border transition-all duration-200 cursor-pointer flex items-center justify-center gap-1 text-xs font-mono ${
              invitationsOpen
                ? 'bg-white/5 border-white/10 text-[#8A99AD] hover:text-rose-400 hover:border-rose-500/30'
                : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
            }`}
          >
            {invitationsOpen ? (
              <Unlock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            ) : (
              <Lock className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            )}
          </button>
        )}

        {/* Divider */}
        <div className="h-4 w-px bg-white/10 mx-0.5" />

        {/* 5. Share Room Code Button (Host Only) */}
        {isHost && (
          <>
            <button
              type="button"
              onClick={onOpenShareModal}
              aria-label="Share Room Code"
              title="Share Room Code"
              className="flex items-center justify-center gap-1.5 px-2.5 sm:px-3 py-2 min-h-[40px] rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white text-xs font-mono transition-all duration-200 cursor-pointer"
            >
              <Share2 className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-[#00E599]" />
              <span className="hidden sm:inline">CODE</span>
            </button>

            {/* Divider */}
            <div className="h-4 w-px bg-white/10 mx-0.5" />
          </>
        )}

        {/* 6. Leave / End Room Action */}
        <div className="flex items-center gap-1">
          {isHost && onPromptEndRoom && (
            <button
              type="button"
              onClick={onPromptEndRoom}
              aria-label="End Party"
              title="End party for everyone"
              className="hidden sm:flex items-center gap-1 px-3 py-2 min-h-[40px] rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/35 text-rose-300 text-xs font-mono font-semibold transition-all duration-200 cursor-pointer active:scale-95"
            >
              <span>END</span>
            </button>
          )}

          <button
            type="button"
            onClick={onLeaveRoom}
            aria-label="Leave Room"
            title="Leave room"
            className="flex items-center justify-center gap-1.5 px-3 sm:px-3.5 py-2 min-h-[40px] rounded-full bg-rose-500/10 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 hover:text-rose-300 text-xs font-mono font-semibold transition-all duration-200 cursor-pointer active:scale-95"
          >
            <LogOut className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            <span>LEAVE</span>
          </button>
        </div>
      </div>
    </nav>
  );
};

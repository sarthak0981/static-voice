import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Crown, AlertCircle, ShieldCheck, GripHorizontal } from 'lucide-react';
import { ChatMessage } from '../types/index.js';
import { evaluateTextSafety, SafetyEvaluation } from '../lib/safety.js';

interface PartyChatProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  currentUserId: string;
}

export const PartyChat: React.FC<PartyChatProps> = ({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  currentUserId
}) => {
  const [inputText, setInputText] = useState('');
  const [safetyViolation, setSafetyViolation] = useState<SafetyEvaluation | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // PC Draggable Floating State
  const [isDesktop, setIsDesktop] = useState(
    typeof window !== 'undefined' ? window.innerWidth >= 640 : true
  );
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; initialX: number; initialY: number } | null>(null);

  // Detect desktop vs mobile viewport
  useEffect(() => {
    const handleResize = () => {
      const desktop = window.innerWidth >= 640;
      setIsDesktop(desktop);

      // Re-clamp position within viewport bounds on desktop resize
      if (desktop) {
        setPosition((prev) => {
          if (!prev) return null;
          const chatWidth = containerRef.current?.offsetWidth || 384;
          const chatHeight = containerRef.current?.offsetHeight || 440;
          return {
            x: Math.max(10, Math.min(window.innerWidth - chatWidth - 10, prev.x)),
            y: Math.max(10, Math.min(window.innerHeight - chatHeight - 10, prev.y))
          };
        });
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Initialize sensible desktop starting position (bottom-right above control notch)
  useEffect(() => {
    if (isOpen && isDesktop && !position) {
      const chatWidth = 384; // w-96
      const chatHeight = 440;
      setPosition({
        x: Math.max(16, window.innerWidth - chatWidth - 24),
        y: Math.max(16, window.innerHeight - chatHeight - 92)
      });
    }
  }, [isOpen, isDesktop, position]);

  // Pointer Drag Handlers (PC only)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    // Don't drag if user clicked an interactive control
    if ((e.target as HTMLElement).closest('button, input, a')) return;

    const chatWidth = containerRef.current?.offsetWidth || 384;
    const chatHeight = containerRef.current?.offsetHeight || 440;
    const currentX = position?.x ?? Math.max(16, window.innerWidth - chatWidth - 24);
    const currentY = position?.y ?? Math.max(16, window.innerHeight - chatHeight - 92);

    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX,
      initialY: currentY
    };

    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dragRef.current || !isDesktop) return;

    const deltaX = e.clientX - dragRef.current.startX;
    const deltaY = e.clientY - dragRef.current.startY;

    const newX = dragRef.current.initialX + deltaX;
    const newY = dragRef.current.initialY + deltaY;

    const chatWidth = containerRef.current?.offsetWidth || 384;
    const chatHeight = containerRef.current?.offsetHeight || 440;

    const clampedX = Math.max(10, Math.min(window.innerWidth - chatWidth - 10, newX));
    const clampedY = Math.max(10, Math.min(window.innerHeight - chatHeight - 10, newY));

    setPosition({ x: clampedX, y: clampedY });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDesktop) return;
    setIsDragging(false);
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputText(val);

    if (val.trim().length > 0) {
      const evaluation = evaluateTextSafety(val, 'chat');
      setSafetyViolation(evaluation.isSafe ? null : evaluation);
    } else {
      setSafetyViolation(null);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean) return;

    const evaluation = evaluateTextSafety(clean, 'chat');
    if (!evaluation.isSafe) {
      setSafetyViolation(evaluation);
      return;
    }

    onSendMessage(clean);
    setInputText('');
    setSafetyViolation(null);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      style={
        isDesktop && position
          ? {
              left: `${position.x}px`,
              top: `${position.y}px`,
              right: 'auto',
              bottom: 'auto'
            }
          : undefined
      }
      className={`fixed z-40 flex flex-col bg-surface/98 border border-surface-border shadow-2xl backdrop-blur-xl transition-shadow ${
        isDesktop
          ? 'w-80 md:w-96 h-[440px] rounded-2xl select-none'
          : 'inset-x-2 bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+62px)] h-[38dvh] max-h-[350px] rounded-2xl animate-in slide-in-from-bottom-4 duration-200'
      } ${isDragging ? 'shadow-[0_24px_60px_rgba(0,0,0,0.7)] ring-1 ring-static-accent/40' : ''}`}
    >
      {/* Header — On PC, this acts as the full drag handle */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`flex items-center justify-between px-3.5 py-2.5 border-b border-surface-border bg-surface-card/75 shrink-0 ${
          isDesktop ? 'cursor-grab active:cursor-grabbing select-none' : ''
        }`}
        title={isDesktop ? 'Click & drag anywhere on this header to move chat' : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isDesktop && (
            <GripHorizontal className="w-4 h-4 text-static-muted hover:text-white transition-colors shrink-0" />
          )}
          <MessageSquare className="w-4 h-4 text-static-accent shrink-0" />
          <span className="text-xs font-mono font-bold tracking-wider text-white">
            PARTY CHAT
          </span>
          <div className="hidden sm:flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-white/5 border border-white/5 text-[9px] font-mono text-static-muted">
            <ShieldCheck className="w-3 h-3 text-static-accent/70" />
            <span>Protected</span>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isDesktop && (
            <span className="text-[10px] font-mono text-static-muted/60 hidden md:inline mr-1 select-none">
              Drag to move
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Chat"
            className="p-1.5 -mr-1 rounded-xl text-static-muted hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2.5 sm:space-y-3 min-h-0">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-3 text-static-muted">
            <MessageSquare className="w-7 h-7 sm:w-8 sm:h-8 opacity-30 mb-2" />
            <span className="text-xs font-mono">No messages yet.</span>
            <span className="text-[11px] text-static-muted/70 mt-0.5">
              Type something below to chat with party members.
            </span>
          </div>
        ) : (
          messages.map((msg) => {
            const isLocal = msg.senderParticipantId === currentUserId;
            const timeStr = new Date(msg.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isLocal ? 'items-end' : 'items-start'}`}
              >
                <div className="flex items-center gap-1.5 mb-0.5 px-1">
                  {msg.isHost && (
                    <Crown className="w-3 h-3 text-amber-400" />
                  )}
                  <span className="text-[11px] font-semibold text-static-subtext font-mono">
                    {msg.senderName} {isLocal && '(You)'}
                  </span>
                  <span className="text-[9px] text-static-muted/60 font-mono">
                    {timeStr}
                  </span>
                </div>

                <div
                  className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-2xl text-xs max-w-[85%] break-words font-sans ${
                    isLocal
                      ? 'bg-static-accent text-background font-medium rounded-br-xs shadow-sm'
                      : 'bg-surface-elevated text-white border border-surface-border rounded-bl-xs'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Real-time Safety Warning Banner */}
      {safetyViolation && (
        <div className="px-3 py-1.5 sm:px-3.5 sm:py-2 bg-rose-500/10 border-t border-rose-500/20 flex items-center justify-between text-xs text-rose-300 animate-in fade-in slide-in-from-bottom-2 duration-200 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertCircle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            <span className="truncate text-[11px] font-sans">
              {safetyViolation.policyViolation || 'Message violates Community Safety Guidelines.'}
            </span>
          </div>
        </div>
      )}

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-2.5 sm:p-3 border-t border-surface-border bg-surface-card/80 flex items-center gap-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={handleInputChange}
          placeholder="Send a message to party…"
          maxLength={300}
          className={`flex-1 px-3 py-2 sm:px-3.5 sm:py-2.5 rounded-xl bg-surface-elevated border text-white placeholder-static-muted/60 text-base sm:text-xs focus:outline-none transition-colors ${
            safetyViolation
              ? 'border-rose-500/60 focus:border-rose-500'
              : 'border-surface-border focus:border-static-accent'
          }`}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || Boolean(safetyViolation)}
          aria-label="Send Message"
          className="p-2 sm:p-2.5 rounded-xl bg-static-accent text-background hover:bg-static-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
};

import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageSquare, X, Crown } from 'lucide-react';
import { ChatMessage } from '../types/index.js';

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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, messages]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop to tap outside and dismiss */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-40 sm:hidden animate-in fade-in duration-200"
        onClick={onClose}
      />

      <div className="fixed inset-x-0 bottom-0 sm:bottom-20 sm:right-6 sm:inset-x-auto w-full sm:w-80 md:w-96 h-[72dvh] sm:h-96 rounded-t-3xl sm:rounded-2xl bg-surface/98 border-t sm:border border-surface-border shadow-2xl backdrop-blur-xl flex flex-col z-50 overflow-hidden animate-in slide-in-from-bottom-6 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border bg-surface-card/60 shrink-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-static-accent" />
            <span className="text-xs font-mono font-bold tracking-wider text-white">
              PARTY CHAT
            </span>
            <span className="text-[10px] font-mono text-static-muted">
              (Party Only)
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Chat"
            className="p-1.5 -mr-1 rounded-xl text-static-muted hover:text-white hover:bg-white/10 active:scale-90 transition-all cursor-pointer flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-static-muted">
            <MessageSquare className="w-8 h-8 opacity-30 mb-2" />
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
                <div className="flex items-center gap-1.5 mb-1 px-1">
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
                  className={`px-3.5 py-2 rounded-2xl text-xs max-w-[85%] break-words font-sans ${
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

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-3 border-t border-surface-border bg-surface-card/80 flex items-center gap-2 shrink-0">
        <input
          ref={inputRef}
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="Send a message to party…"
          maxLength={300}
          className="flex-1 px-3.5 py-2.5 rounded-xl bg-surface-elevated border border-surface-border text-white placeholder-static-muted/60 text-base sm:text-xs focus:outline-none focus:border-static-accent transition-colors"
        />
        <button
          type="submit"
          disabled={!inputText.trim()}
          aria-label="Send Message"
          className="p-2.5 rounded-xl bg-static-accent text-background hover:bg-static-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
      </div>
    </>
  );
};

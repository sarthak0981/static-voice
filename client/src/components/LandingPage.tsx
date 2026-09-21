import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';
import {
  validateUsername,
  validateRoomCode,
  MAX_USERNAME_LENGTH
} from '../lib/validation.js';

export interface RecentRoomInfo {
  roomId: string;
  roomName: string;
  displayName: string;
  timestamp: number;
}

interface LandingPageProps {
  onCreateRoom: (roomName: string, displayName: string) => Promise<void>;
  onJoinRoom: (roomId: string, displayName: string) => Promise<void>;
  initialRoomId?: string;
  isLoading: boolean;
  errorMessage?: string;
  recentRoom?: RecentRoomInfo | null;
  onDismissRecentRoom?: () => void;
  onToggleDiagnostics?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onCreateRoom,
  onJoinRoom,
  initialRoomId = '',
  isLoading,
  errorMessage,
  recentRoom,
  onDismissRecentRoom,
  onToggleDiagnostics
}) => {
  const [activeTab, setActiveTab] = useState<'CREATE' | 'JOIN'>('CREATE');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Form states
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId.toUpperCase());
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');

  // Inline Validation States
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);

  // If accessed with initial room ID, pre-validate and open Join tab
  useEffect(() => {
    if (initialRoomId) {
      const codeValidation = validateRoomCode(initialRoomId);
      if (codeValidation.isValid) {
        const code = codeValidation.normalized;
        setRoomIdInput(code);
        setIsValidatingCode(true);

        fetch(`/api/room/${encodeURIComponent(code)}`)
          .then(async (res) => {
            if (res.status === 404) {
              setCodeError("We couldn't find that room.");
              return;
            }
            if (!res.ok) {
              const err = await res.json().catch(() => null);
              setCodeError(err?.error || "We couldn't find that room.");
              return;
            }
            const data = await res.json();
            if (!data.exists) {
              setCodeError("We couldn't find that room.");
              return;
            }
            if (data.invitationsOpen === false) {
              setCodeError("The invitations are closed.");
              return;
            }
            setActiveTab('JOIN');
            setIsModalOpen(true);
          })
          .catch(() => {
            setCodeError("Unable to verify room. Please check your connection.");
          })
          .finally(() => {
            setIsValidatingCode(false);
          });
      }
    }
  }, [initialRoomId]);

  const handleNameChange = (val: string) => {
    const sliced = val.slice(0, MAX_USERNAME_LENGTH);
    setDisplayName(sliced);

    if (sliced.length > 0) {
      const result = validateUsername(sliced);
      if (!result.isValid) {
        setNameError(result.error || 'Invalid name');
      } else {
        setNameError(null);
      }
    } else {
      setNameError(null);
    }
  };

  const handleCodeChange = (val: string) => {
    const sanitized = val.toUpperCase().replace(/[^2-9A-Z]/g, '').slice(0, 8);
    setRoomIdInput(sanitized);
    setCodeError(null);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setNameError('Please enter your name');
      return;
    }
    const result = validateUsername(displayName);
    if (!result.isValid) {
      setNameError(result.error || 'Invalid name');
      return;
    }
    await onCreateRoom(roomName.trim(), displayName.trim());
  };

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomIdInput.trim()) {
      setCodeError('Please enter a room ID');
      return;
    }
    const codeResult = validateRoomCode(roomIdInput.trim());
    if (!codeResult.isValid) {
      setCodeError(codeResult.error || 'Invalid room ID');
      return;
    }

    if (!displayName.trim()) {
      setNameError('Please enter your name');
      return;
    }
    const nameResult = validateUsername(displayName);
    if (!nameResult.isValid) {
      setNameError(nameResult.error || 'Invalid name');
      return;
    }

    await onJoinRoom(codeResult.normalized, displayName.trim());
  };

  return (
    <div className="relative min-h-[100dvh] w-full flex flex-col items-center justify-between px-6 pt-12 pb-10 bg-static-atmosphere bg-static-noise text-static-text overflow-hidden select-none">
      {/* Subtle quiet breathing ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[350px] bg-static-accent/5 rounded-full blur-[140px] pointer-events-none animate-soft-atmosphere" />

      {/* Top spacer */}
      <div className="w-full flex justify-end items-center max-w-5xl z-10">
        {recentRoom && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-surface-elevated/70 border border-surface-border backdrop-blur-md">
            <span className="text-xs text-slate-400 font-mono">
              Rejoin <span className="text-white font-medium">{recentRoom.roomName || recentRoom.roomId}</span>
            </span>
            <button
              type="button"
              onClick={() => onJoinRoom(recentRoom.roomId, recentRoom.displayName)}
              disabled={isLoading}
              className="text-xs font-mono font-semibold text-static-accentLight hover:text-white transition-colors cursor-pointer"
            >
              REJOIN
            </button>
            {onDismissRecentRoom && (
              <button
                type="button"
                onClick={onDismissRecentRoom}
                aria-label="Dismiss rejoin"
                className="text-slate-500 hover:text-white transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Center Cinematic Stage with Enormous Negative Space */}
      <main className="flex-1 flex flex-col items-center justify-center text-center max-w-2xl z-10 px-4 my-auto">
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extralight tracking-[0.38em] text-white uppercase select-none transition-all">
          S T A T I C
        </h1>

        <p className="mt-5 sm:mt-6 text-xs sm:text-sm font-mono tracking-[0.28em] text-slate-400 uppercase select-none">
          Voice, without the noise.
        </p>

        {/* Global Error Notice if any */}
        {errorMessage && (
          <div className="mt-8 px-4 py-2 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-mono flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Two Primary Actions */}
        <div className="mt-14 sm:mt-20 flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-6 w-full max-w-sm">
          <button
            type="button"
            onClick={() => {
              setActiveTab('CREATE');
              setIsModalOpen(true);
            }}
            disabled={isLoading}
            className="w-full sm:w-48 py-3.5 px-6 rounded-full bg-white text-black font-mono text-xs font-semibold tracking-wider hover:bg-white/90 active:scale-[0.98] transition-all shadow-[0_0_24px_rgba(255,255,255,0.15)] cursor-pointer"
          >
            CREATE ROOM
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('JOIN');
              setIsModalOpen(true);
            }}
            disabled={isLoading}
            className="w-full sm:w-48 py-3.5 px-6 rounded-full bg-transparent hover:bg-white/5 border border-white/15 text-white font-mono text-xs font-semibold tracking-wider active:scale-[0.98] transition-all cursor-pointer"
          >
            JOIN ROOM
          </button>
        </div>
      </main>

      {/* Bottom Metadata & Version */}
      <footer className="w-full flex flex-col items-center justify-center gap-2.5 z-10">
        <span className="text-[11px] font-mono tracking-[0.24em] text-slate-500 uppercase select-none">
          Private &bull; Simple &bull; Real
        </span>
        <button
          type="button"
          onClick={onToggleDiagnostics}
          title="STATIC v1.3.5 • System Diagnostics"
          className="text-[10px] text-slate-600 hover:text-slate-400 font-mono tracking-widest transition-colors cursor-pointer select-none"
        >
          v1.3.5
        </button>
      </footer>

      {/* SCREEN 2: Unified Clean Create / Join Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md modal-backdrop-anim">
          <div className="relative w-full max-w-md bg-surface border border-surface-border rounded-2xl p-6 sm:p-8 shadow-2xl modal-content-anim text-left">
            {/* Top Close Button */}
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              aria-label="Close"
              className="absolute top-5 right-5 p-1.5 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Mode Switcher Tabs */}
            <div className="flex items-center gap-6 border-b border-surface-border pb-4 mb-6">
              <button
                type="button"
                onClick={() => setActiveTab('CREATE')}
                className={`font-mono text-xs tracking-widest uppercase transition-colors cursor-pointer ${
                  activeTab === 'CREATE'
                    ? 'text-white font-semibold border-b-2 border-static-accent pb-1 -mb-[18px]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                CREATE
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('JOIN')}
                className={`font-mono text-xs tracking-widest uppercase transition-colors cursor-pointer ${
                  activeTab === 'JOIN'
                    ? 'text-white font-semibold border-b-2 border-static-accent pb-1 -mb-[18px]'
                    : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                JOIN
              </button>
            </div>

            {/* Mode: CREATE */}
            {activeTab === 'CREATE' && (
              <form onSubmit={handleCreateSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-light text-white tracking-wide">
                    Create a Room
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 font-light">
                    Start a private conversation. Invite others using your room ID.
                  </p>
                </div>

                <div className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1.5">
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sarthak"
                      value={displayName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      maxLength={MAX_USERNAME_LENGTH}
                      autoFocus
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-card border text-white placeholder-slate-600 focus:outline-none text-sm transition-colors ${
                        nameError
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-surface-border focus:border-static-accent'
                      }`}
                    />
                    {nameError && (
                      <p className="mt-1 text-xs text-rose-400 font-mono">{nameError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1.5">
                      Room Name <span className="text-slate-600">(Optional)</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Focus Room, Duo Sync"
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      maxLength={40}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-surface-card border border-surface-border text-white placeholder-slate-600 focus:outline-none focus:border-static-accent text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!displayName.trim() || Boolean(nameError) || isLoading}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-white text-black font-mono font-semibold text-xs tracking-wider hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
                >
                  {isLoading ? 'VERIFYING AUDIO…' : 'CREATE ROOM'}
                </button>
              </form>
            )}

            {/* Mode: JOIN */}
            {activeTab === 'JOIN' && (
              <form onSubmit={handleJoinSubmit} className="space-y-5">
                <div>
                  <h2 className="text-lg font-light text-white tracking-wide">
                    Join a Room
                  </h2>
                  <p className="mt-1 text-xs text-slate-400 font-light">
                    Enter your room ID to connect.
                  </p>
                </div>

                <div className="space-y-4 pt-1">
                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1.5">
                      Room ID
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 7K4X92"
                      value={roomIdInput}
                      onChange={(e) => handleCodeChange(e.target.value)}
                      maxLength={8}
                      autoFocus
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-card border font-mono tracking-widest uppercase text-base sm:text-sm text-white placeholder-slate-600 focus:outline-none transition-colors ${
                        codeError
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-surface-border focus:border-static-accent'
                      }`}
                    />
                    {codeError && (
                      <p className="mt-1 text-xs text-rose-400 font-mono">{codeError}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-[11px] font-mono tracking-wider text-slate-400 uppercase mb-1.5">
                      Your Name
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Sarthak"
                      value={displayName}
                      onChange={(e) => handleNameChange(e.target.value)}
                      maxLength={MAX_USERNAME_LENGTH}
                      className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-card border text-white placeholder-slate-600 focus:outline-none text-sm transition-colors ${
                        nameError
                          ? 'border-rose-500 focus:border-rose-500'
                          : 'border-surface-border focus:border-static-accent'
                      }`}
                    />
                    {nameError && (
                      <p className="mt-1 text-xs text-rose-400 font-mono">{nameError}</p>
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!roomIdInput.trim() || !displayName.trim() || Boolean(nameError) || isLoading || isValidatingCode}
                  className="w-full mt-2 py-3 px-4 rounded-xl bg-white text-black font-mono font-semibold text-xs tracking-wider hover:bg-white/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer flex items-center justify-center min-h-[44px]"
                >
                  {isLoading ? 'VERIFYING AUDIO…' : 'JOIN ROOM'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

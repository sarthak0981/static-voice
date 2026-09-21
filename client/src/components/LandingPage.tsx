import React, { useState, useEffect } from 'react';
import { Radio, ArrowRight, Sparkles, AlertCircle, Users, X, Loader2 } from 'lucide-react';
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
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onCreateRoom,
  onJoinRoom,
  initialRoomId = '',
  isLoading,
  errorMessage,
  recentRoom,
  onDismissRecentRoom
}) => {
  const [roomIdInput, setRoomIdInput] = useState(initialRoomId.toUpperCase());
  const [displayName, setDisplayName] = useState('');
  const [roomName, setRoomName] = useState('');

  // Inline Validation States
  const [nameError, setNameError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [isValidatingCode, setIsValidatingCode] = useState(false);

  // Modals
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState(initialRoomId.toUpperCase());

  // If accessed with initial room ID, pre-validate before opening modal
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
              setCodeError("Invitations for this room are paused.");
              return;
            }
            setTargetRoomId(code);
            setIsJoinModalOpen(true);
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

  // Live Username Input Handler
  const handleNameChange = (val: string) => {
    // Restrict input length to max 24 chars
    const sliced = val.slice(0, MAX_USERNAME_LENGTH);
    setDisplayName(sliced);

    if (sliced.length > 0) {
      const result = validateUsername(sliced);
      setNameError(result.isValid ? null : result.error || null);
    } else {
      setNameError(null);
    }
  };

  // Live Room Code Input Handler
  const handleCodeChange = (val: string) => {
    // Normalize: remove spaces, convert to uppercase, max 8 chars
    const normalized = val.replace(/\s+/g, '').toUpperCase().slice(0, 8);
    setRoomIdInput(normalized);

    if (normalized.length > 0) {
      const result = validateRoomCode(normalized);
      setCodeError(result.isValid ? null : result.error || null);
    } else {
      setCodeError(null);
    }
  };

  const handleOpenCreate = () => {
    setNameError(null);
    setIsCreateModalOpen(true);
  };

  const handleOpenJoinWithCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const codeValidation = validateRoomCode(roomIdInput);
    if (!codeValidation.isValid) {
      setCodeError(codeValidation.error || 'Please enter a valid room code.');
      return;
    }

    setIsValidatingCode(true);
    setCodeError(null);

    try {
      const res = await fetch(`/api/room/${encodeURIComponent(codeValidation.normalized)}`);
      if (res.status === 404) {
        setCodeError("We couldn't find that room.");
        return;
      }
      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        setCodeError(errorData?.error || "We couldn't find that room.");
        return;
      }

      const data = await res.json();
      if (!data.exists) {
        setCodeError("We couldn't find that room.");
        return;
      }

      if (data.invitationsOpen === false) {
        setCodeError("Invitations for this room are paused.");
        return;
      }

      // Valid and open!
      setCodeError(null);
      setNameError(null);
      setTargetRoomId(codeValidation.normalized);
      setIsJoinModalOpen(true);
    } catch {
      setCodeError("Unable to verify room. Please check your connection.");
    } finally {
      setIsValidatingCode(false);
    }
  };

  const handleConfirmCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const nameValidation = validateUsername(displayName);
    if (!nameValidation.isValid) {
      setNameError(nameValidation.error || 'Please enter a valid username.');
      return;
    }

    await onCreateRoom(roomName.trim(), nameValidation.normalized);
  };

  const handleConfirmJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    const codeValidation = validateRoomCode(targetRoomId);
    if (!codeValidation.isValid) {
      setCodeError(codeValidation.error || 'Invalid room code.');
      return;
    }

    const nameValidation = validateUsername(displayName);
    if (!nameValidation.isValid) {
      setNameError(nameValidation.error || 'Please enter a valid username.');
      return;
    }

    await onJoinRoom(codeValidation.normalized, nameValidation.normalized);
  };

  const nameLength = displayName.trim().length;

  return (
    <div className="relative min-h-[100dvh] flex flex-col items-center justify-center px-4 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] bg-background bg-static-noise text-static-text overflow-hidden">
      {/* Ambient background glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[320px] sm:w-[500px] h-[320px] sm:h-[500px] bg-static-accent/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center">
        {/* Futuristic Brand Wordmark */}
        <div className="flex items-center gap-3 mb-6 sm:mb-8 tracking-[0.25em]">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-surface-card border border-surface-border">
            <Radio className="w-5 h-5 text-static-accent animate-pulse" />
            <div className="absolute inset-0 rounded-xl bg-static-accent/10 blur-sm pointer-events-none" />
          </div>
          <span className="text-2xl font-bold font-mono tracking-[0.3em] text-white">
            STATIC
          </span>
        </div>

        {/* Hero Title */}
        <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white mb-3 sm:mb-4 leading-tight">
          Voice, without the noise.
        </h1>

        {/* Supporting subtext */}
        <p className="text-sm sm:text-base text-static-subtext mb-8 sm:mb-10 max-w-sm font-normal">
          Direct, private voice conversations. No accounts or downloads required.
        </p>

        {/* Error message if any */}
        {errorMessage && (
          <div className="w-full mb-6 p-4 rounded-xl bg-static-danger/10 border border-static-danger/25 text-static-danger flex items-start gap-3 text-left text-sm animate-in fade-in">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Recent Room Accidental Disconnect Recovery Card */}
        {recentRoom && (
          <div className="w-full mb-6 p-4 rounded-2xl bg-[#0E121E]/90 border border-[#00E599]/30 shadow-xl shadow-black/40 flex items-center justify-between gap-3 text-left animate-in fade-in slide-in-from-top-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[#00E599] text-[10px] font-mono font-bold tracking-wider mb-1">
                <span className="w-2 h-2 rounded-full bg-[#00E599] animate-pulse" />
                <span>PREVIOUS SESSION</span>
              </div>
              <p className="text-sm font-semibold text-white truncate">
                {recentRoom.roomName || `Party ${recentRoom.roomId}`}
              </p>
              <p className="text-xs text-[#8A99AD] font-mono truncate">
                Rejoin as <span className="text-white font-medium">{recentRoom.displayName}</span>
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => onJoinRoom(recentRoom.roomId, recentRoom.displayName)}
                disabled={isLoading}
                className="px-4 py-2 rounded-xl bg-[#00E599] hover:bg-[#00E599]/90 text-black font-mono font-bold text-xs tracking-wider transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
              >
                REJOIN
              </button>
              {onDismissRecentRoom && (
                <button
                  type="button"
                  onClick={onDismissRecentRoom}
                  aria-label="Dismiss rejoin banner"
                  className="p-1.5 text-[#8A99AD] hover:text-white transition-colors cursor-pointer rounded-lg hover:bg-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Primary Action: CREATE ROOM */}
        <button
          type="button"
          onClick={handleOpenCreate}
          disabled={isLoading}
          className="w-full py-3.5 sm:py-4 px-6 rounded-xl bg-static-accent text-background font-semibold text-sm sm:text-base tracking-wide flex items-center justify-center gap-2 hover:bg-static-accent/90 active:scale-[0.99] transition-all duration-150 shadow-lg shadow-static-accent/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group min-h-[48px]"
        >
          <Sparkles className="w-5 h-5 transition-transform group-hover:rotate-12" />
          <span>Create Room</span>
        </button>

        {/* Divider */}
        <div className="flex items-center gap-4 w-full my-6 sm:my-8">
          <div className="flex-1 h-px bg-surface-border" />
          <span className="text-xs uppercase font-mono tracking-widest text-static-muted">
            or enter code
          </span>
          <div className="flex-1 h-px bg-surface-border" />
        </div>

        {/* Secondary Action: ENTER CODE */}
        <form onSubmit={handleOpenJoinWithCode} className="w-full flex flex-col gap-3">
          <div className="relative flex items-center">
            <input
              type="text"
              placeholder="Room code (e.g. 7K4X92)"
              value={roomIdInput}
              onChange={(e) => handleCodeChange(e.target.value)}
              disabled={isLoading}
              maxLength={8}
              className={`w-full pl-4 pr-12 py-3 sm:py-3.5 rounded-xl bg-surface-card border text-white placeholder-static-muted/50 focus:outline-none font-mono tracking-wider uppercase text-base sm:text-sm transition-colors ${
                codeError
                  ? 'border-static-danger focus:border-static-danger'
                  : 'border-surface-border focus:border-static-accent'
              }`}
            />
            <button
              type="submit"
              disabled={isLoading || isValidatingCode || !roomIdInput.trim()}
              aria-label="Join Room"
              className="absolute right-2 p-2 rounded-lg bg-surface-hover text-white hover:text-static-accent hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
            >
              {isValidatingCode ? (
                <Loader2 className="w-4 h-4 animate-spin text-static-accent" />
              ) : (
                <ArrowRight className="w-4 h-4" />
              )}
            </button>
          </div>

          {codeError && (
            <p className="text-left text-xs text-static-danger px-1 flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{codeError}</span>
            </p>
          )}

          <button
            type="submit"
            disabled={isLoading || isValidatingCode || !roomIdInput.trim()}
            className="w-full py-3.5 px-4 rounded-xl bg-surface-card border border-surface-border text-white font-medium text-sm hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
          >
            {isValidatingCode ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-static-accent" />
                <span>Checking room…</span>
              </>
            ) : (
              <span>Join Room</span>
            )}
          </button>
        </form>

        <div className="mt-12 flex flex-col items-center justify-center">
          <p className="text-[11px] text-[#4E586E] font-mono tracking-wide">
            PRIVATE • EPHEMERAL • DIRECT
          </p>
        </div>
      </div>

      {/* CREATE ROOM MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-surface-border shadow-2xl p-5 sm:p-6 text-left modal-content-anim">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-static-accent" />
                <h3 className="text-lg font-bold text-white font-sans">Create Room</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-static-muted hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmCreate} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-mono tracking-wider text-static-muted mb-1.5">
                  Room Name <span className="text-static-muted/70">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Chill Voice Hub, Apex Duo, Study Sync"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  maxLength={40}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-card border border-surface-border text-white placeholder-static-muted/50 focus:outline-none focus:border-static-accent text-base sm:text-sm"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs uppercase font-mono tracking-wider text-static-muted">
                    Your Username <span className="text-static-accent">*</span>
                  </label>
                  <span
                    className={`text-[11px] font-mono ${
                      nameLength >= MAX_USERNAME_LENGTH
                        ? 'text-static-danger font-bold'
                        : nameLength > 18
                        ? 'text-amber-400'
                        : 'text-static-muted'
                    }`}
                  >
                    {nameLength}/{MAX_USERNAME_LENGTH}
                  </span>
                </div>

                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Alex, Maya, Neo"
                  value={displayName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  maxLength={MAX_USERNAME_LENGTH}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-card border text-white placeholder-static-muted/50 focus:outline-none text-base sm:text-sm transition-colors ${
                    nameError
                      ? 'border-static-danger focus:border-static-danger'
                      : 'border-surface-border focus:border-static-accent'
                  }`}
                />

                {nameError ? (
                  <p className="text-xs text-static-danger mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{nameError}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-static-muted/70 mt-1.5">
                    Letters, numbers, spaces, underscores, and hyphens allowed.
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-xs font-mono font-medium transition-colors cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!displayName.trim() || Boolean(nameError) || isLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-static-accent text-background font-mono font-bold text-xs hover:bg-static-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  {isLoading ? 'Preparing audio…' : 'Create Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* JOIN ROOM USERNAME PROMPT MODAL */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md modal-backdrop-anim">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-surface border border-surface-border shadow-2xl p-5 sm:p-6 text-left modal-content-anim">
            <div className="flex items-center justify-between pb-3 border-b border-surface-border mb-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-static-accent" />
                <h3 className="text-lg font-bold text-white font-sans">Join Room</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsJoinModalOpen(false)}
                className="p-1 text-static-muted hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmJoin} className="space-y-4">
              <div>
                <label className="block text-xs uppercase font-mono tracking-wider text-static-muted mb-1.5">
                  Room ID
                </label>
                <input
                  type="text"
                  readOnly
                  value={targetRoomId}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-surface-card border border-surface-border text-static-accent font-mono font-bold tracking-widest text-base sm:text-sm select-all"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs uppercase font-mono tracking-wider text-static-muted">
                    Enter Your Username <span className="text-static-accent">*</span>
                  </label>
                  <span
                    className={`text-[11px] font-mono ${
                      nameLength >= MAX_USERNAME_LENGTH
                        ? 'text-static-danger font-bold'
                        : nameLength > 18
                        ? 'text-amber-400'
                        : 'text-static-muted'
                    }`}
                  >
                    {nameLength}/{MAX_USERNAME_LENGTH}
                  </span>
                </div>

                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="Choose what you want to be called"
                  value={displayName}
                  onChange={(e) => handleNameChange(e.target.value)}
                  maxLength={MAX_USERNAME_LENGTH}
                  className={`w-full px-3.5 py-2.5 rounded-xl bg-surface-card border text-white placeholder-static-muted/50 focus:outline-none text-base sm:text-sm transition-colors ${
                    nameError
                      ? 'border-static-danger focus:border-static-danger'
                      : 'border-surface-border focus:border-static-accent'
                  }`}
                />

                {nameError ? (
                  <p className="text-xs text-static-danger mt-1.5 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{nameError}</span>
                  </p>
                ) : (
                  <p className="text-[11px] text-static-muted/70 mt-1.5">
                    Letters, numbers, spaces, underscores, and hyphens allowed.
                  </p>
                )}
              </div>

              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsJoinModalOpen(false)}
                  className="flex-1 py-3 px-4 rounded-xl bg-surface-card hover:bg-surface-hover border border-surface-border text-white text-xs font-mono font-medium transition-colors cursor-pointer min-h-[44px]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!displayName.trim() || Boolean(nameError) || isLoading}
                  className="flex-1 py-3 px-4 rounded-xl bg-static-accent text-background font-mono font-bold text-xs hover:bg-static-accent/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md cursor-pointer flex items-center justify-center gap-1.5 min-h-[44px]"
                >
                  {isLoading ? 'Preparing audio…' : 'Join Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

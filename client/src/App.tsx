import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import {
  ClientRoomState,
  ConnectionStatus,
  MicrophoneState,
  Participant,
  ChatMessage
} from './types/index.js';
import {
  getSocket,
  subscribeConnectionStatus,
  getStoredSessionToken,
  storeSessionToken,
  clearStoredSessionToken
} from './lib/socket.js';
import { WebRTCVoiceEngine } from './lib/webrtc.js';
import { LandingPage, RecentRoomInfo } from './components/LandingPage.js';
import { TopBar } from './components/TopBar.js';
import { PartyGrid } from './components/PartyGrid.js';
import { LoungeDrawer } from './components/LoungeDrawer.js';
import { ZenLoungeView } from './components/ZenLoungeView.js';
import { ControlBar } from './components/ControlBar.js';
import { NotificationCapsule, NotificationItem } from './components/NotificationCapsule.js';
import { HostActionSheet } from './components/HostActionSheet.js';
import { VoiceDiagnosticsModal } from './components/VoiceDiagnosticsModal.js';
import { ConnectionQuality, PeerConnectionStats } from './lib/webrtcDiagnostics.js';
import {
  EndRoomModal,
  ShareModal,
  RoomSettingsModal
} from './components/Modals.js';
import { HostTransferModal } from './components/HostTransferModal.js';
import { HostPromotedModal } from './components/HostPromotedModal.js';
import { PartyChat } from './components/PartyChat.js';
import {
  QueueScreen,
  InvitationsClosedScreen,
  MessageScreen,
  MicPromptBanner
} from './components/StateScreens.js';
import { notificationSound } from './lib/audioNotification.js';

export function App() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('CONNECTING');
  const [roomState, setRoomState] = useState<ClientRoomState | null>(null);
  const [initialRoomId, setInitialRoomId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // Screen states
  const [screenState, setScreenState] = useState<
    'HOME' | 'ROOM' | 'QUEUE' | 'INVITATIONS_CLOSED' | 'ROOM_ENDED' | 'REMOVED'
  >('HOME');
  const [screenMessage, setScreenMessage] = useState<{ title: string; message: string; submessage?: string }>({
    title: '',
    message: ''
  });

  // Microphone & Audio
  const [microphoneState, setMicrophoneState] = useState<MicrophoneState>('OFF');
  const [hostGraceSeconds, setHostGraceSeconds] = useState<number | undefined>(undefined);
  const graceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [disconnectedPeerIds, setDisconnectedPeerIds] = useState<Set<string>>(new Set());

  // Recent Room accidental disconnect recovery
  const RECENT_ROOM_STORAGE_KEY = 'static_last_active_room';
  const [recentRoom, setRecentRoom] = useState<RecentRoomInfo | null>(() => {
    try {
      const saved = localStorage.getItem('static_last_active_room');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.timestamp && Date.now() - parsed.timestamp < 45 * 60 * 1000) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });

  const handleDismissRecentRoom = () => {
    try {
      localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
    } catch {}
    setRecentRoom(null);
  };

  // Warn before accidental reload/close while inside active room
  useEffect(() => {
    if (!roomState || screenState !== 'ROOM') return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'You are currently in an active voice room. Leaving or reloading will disconnect you.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [roomState, screenState]);

  // In-Party Keyboard Chat & Popup
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [latestChatMessage, setLatestChatMessage] = useState<ChatMessage | null>(null);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  // Modals
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isEndRoomModalOpen, setIsEndRoomModalOpen] = useState<boolean>(false);
  const [isHostTransferModalOpen, setIsHostTransferModalOpen] = useState<boolean>(false);
  const [isHostPromotedModalOpen, setIsHostPromotedModalOpen] = useState<boolean>(false);
  const [isMobileLoungeOpen, setIsMobileLoungeOpen] = useState<boolean>(false);
  const [isLoungeCollapsed, setIsLoungeCollapsed] = useState<boolean>(false);

  const prevRoleRef = useRef<string | null>(null);
  const webrtcEngineRef = useRef<WebRTCVoiceEngine | null>(null);
  const isChatOpenRef = useRef<boolean>(isChatOpen);
  const roomStateRef = useRef<ClientRoomState | null>(roomState);

  useEffect(() => {
    isChatOpenRef.current = isChatOpen;
  }, [isChatOpen]);

  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // Unified FIFO Notification Queue
  const [notificationQueue, setNotificationQueue] = useState<NotificationItem[]>([]);

  const queueNotification = useCallback((item: Omit<NotificationItem, 'id'>) => {
    const id = 'notif_' + Math.random().toString(36).substring(2, 9);
    setNotificationQueue((prev) => [...prev, { ...item, id }]);
  }, []);

  const handleDismissNotification = useCallback(() => {
    setNotificationQueue((prev) => prev.slice(1));
  }, []);

  const showToast = useCallback((msg: string, icon?: NotificationItem['icon']) => {
    queueNotification({
      message: msg,
      icon: icon || 'info',
      type: 'info'
    });
  }, [queueNotification]);

  // Per-Participant Volume Control (0 to 100)
  const [peerVolumes, setPeerVolumes] = useState<Record<string, number>>({});
  const [selectedParticipantForAction, setSelectedParticipantForAction] = useState<Participant | null>(null);

  // WebRTC Diagnostics & Quality Tracking
  const [peerQualities, setPeerQualities] = useState<Record<string, ConnectionQuality>>({});
  const [diagnosticsStats, setDiagnosticsStats] = useState<Map<string, PeerConnectionStats>>(new Map());
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState<boolean>(false);

  // Developer diagnostics shortcut (Ctrl+Shift+D or Cmd+Shift+D) & URL check (?diag=1)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'D' || e.key === 'd')) {
        e.preventDefault();
        setIsDiagnosticsOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('diag') === '1' || urlParams.get('debug') === 'voice') {
      setIsDiagnosticsOpen(true);
    }

    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleVolumeChange = useCallback((participantId: string, volume: number) => {
    setPeerVolumes((prev) => ({ ...prev, [participantId]: volume }));
    webrtcEngineRef.current?.setPeerVolume(participantId, volume / 100);
  }, []);

  const handleShiftParticipant = useCallback((participantId: string, direction: -1 | 1) => {
    if (!roomStateRef.current) return;
    const party = [...roomStateRef.current.party];
    const idx = party.findIndex((p) => p.participantId === participantId);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= party.length) return;
    const [moved] = party.splice(idx, 1);
    party.splice(newIdx, 0, moved);

    const socket = getSocket();
    socket.emit('reorder-party', { orderedParticipantIds: party.map((p) => p.participantId) });
  }, []);

  const handleToggleLounge = useCallback(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setIsMobileLoungeOpen((prev) => !prev);
    } else {
      setIsLoungeCollapsed((prev) => !prev);
    }
  }, []);

  // Parse deep link room ID on load (/r/7K4X92 or ?r=7K4X92)
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/\/r\/([2-9A-Z]{5,8})/i);
    if (match) {
      setInitialRoomId(match[1].toUpperCase());
    } else {
      const urlParams = new URLSearchParams(window.location.search);
      const r = urlParams.get('r');
      if (r) setInitialRoomId(r.toUpperCase());
    }
  }, []);

  // Subscribe to connection status
  useEffect(() => {
    const unsubscribe = subscribeConnectionStatus(setConnectionStatus);
    return unsubscribe;
  }, []);

  // Initialize WebRTC engine
  useEffect(() => {
    const engine = new WebRTCVoiceEngine({
      onMicrophoneStateChange: (state) => setMicrophoneState(state),
      onSpeakingChange: (_isSpeaking) => {},
      onPeerQualityChange: (peerId, quality) => {
        setPeerQualities((prev) => ({ ...prev, [peerId]: quality }));
      },
      onDiagnosticsUpdate: (stats) => {
        setDiagnosticsStats(stats);
      },
      onAutoplayBlocked: (blocked) => {
        if (blocked) {
          queueNotification({
            message: 'Audio paused by browser',
            icon: 'volume',
            type: 'action',
            actionText: 'TAP TO UNMUTE',
            onAction: () => {
              webrtcEngineRef.current?.unlockAudio();
            }
          });
        }
      },
      onError: (msg) => showToast(msg)
    });

    webrtcEngineRef.current = engine;

    return () => {
      engine.teardown();
      webrtcEngineRef.current = null;
    };
  }, [showToast, queueNotification]);

  // Setup Socket.io event listeners
  useEffect(() => {
    const socket = getSocket();

    const handleRoomStateUpdated = (updatedState: ClientRoomState) => {
      // Check if this local user was promoted from GUEST to HOST!
      if (
        prevRoleRef.current === 'GUEST' &&
        updatedState.currentUser.role === 'HOST'
      ) {
        setIsHostPromotedModalOpen(true);
      }
      prevRoleRef.current = updatedState.currentUser.role;

      // Sync chat history from server if local is empty
      if (updatedState.chatHistory && updatedState.chatHistory.length > 0) {
        setChatMessages((prev) => {
          const map = new Map<string, ChatMessage>();
          updatedState.chatHistory.forEach((m) => map.set(m.id, m));
          prev.forEach((m) => map.set(m.id, m));
          return Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
        });
      }

      setRoomState(updatedState);

      if (updatedState.currentUser.state === 'QUEUED') {
        setScreenState('QUEUE');
      } else if (updatedState.currentUser.state === 'LOUNGE' || updatedState.currentUser.state === 'PARTY') {
        if (screenState === 'QUEUE') {
          showToast("A spot opened. You're in.");
        }
        setScreenState('ROOM');
      }
    };

    const handleParticipantAdmitted = (_admitted: Participant) => {
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      showToast("You've been admitted to the Party!");

      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.startMicrophone();
        webrtcEngineRef.current.unlockAudio();
        const micState = webrtcEngineRef.current.getIsMuted() ? 'MUTED' : 'ON';
        getSocket().emit('update-mic-state', { microphoneState: micState });
      }
    };

    const handleForceMuted = (payload: { reason: string }) => {
      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.forceMute();
      }
      showToast(payload.reason || 'The host muted your microphone.');
    };

    const handleKicked = (payload: { reason: string }) => {
      try {
        localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
      } catch {}
      setRecentRoom(null);
      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.teardown();
      }
      setScreenMessage({
        title: 'REMOVED FROM ROOM',
        message: payload.reason || 'You were removed from the room.'
      });
      setScreenState('REMOVED');
      setRoomState(null);
    };

    const handleLoungeCleared = (payload: { reason: string }) => {
      try {
        localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
      } catch {}
      setRecentRoom(null);
      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.teardown();
      }
      setScreenMessage({
        title: 'LOUNGE CLEARED',
        message: payload.reason || 'The host cleared the waiting lounge.'
      });
      setScreenState('REMOVED');
      setRoomState(null);
    };

    const handleRemovedFromParty = (payload: { reason: string }) => {
      try {
        localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
      } catch {}
      setRecentRoom(null);
      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.teardown();
      }
      setScreenMessage({
        title: 'REMOVED FROM PARTY',
        message: payload.reason || 'The host removed you from the Party.'
      });
      setScreenState('REMOVED');
      setRoomState(null);
    };

    const handleRoomEnded = (payload: { reason: string }) => {
      try {
        localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
      } catch {}
      setRecentRoom(null);
      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.teardown();
      }
      setScreenMessage({
        title: 'ROOM ENDED',
        message: payload.reason || 'The host closed the room. 👋',
        submessage: 'This room has been permanently terminated.'
      });
      setScreenState('ROOM_ENDED');
      setRoomState(null);
    };

    const handleHostChanged = (payload: { newHostId: string; message: string }) => {
      if (graceIntervalRef.current) {
        clearInterval(graceIntervalRef.current);
        graceIntervalRef.current = null;
      }
      setHostGraceSeconds(undefined);

      // If this client is the new host, trigger promotion modal
      if (roomState?.currentUser.participantId === payload.newHostId) {
        setIsHostPromotedModalOpen(true);
      } else {
        showToast(payload.message || 'A new host is running the room.');
      }
    };

    const handleHostDisconnectWarning = (payload: { secondsRemaining: number; message: string }) => {
      showToast(payload.message);
      setHostGraceSeconds(payload.secondsRemaining);

      if (graceIntervalRef.current) {
        clearInterval(graceIntervalRef.current);
      }

      graceIntervalRef.current = setInterval(() => {
        setHostGraceSeconds((prev) => {
          if (!prev || prev <= 1) {
            if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
            return undefined;
          }
          return prev - 1;
        });
      }, 1000);
    };

    const handleHostReconnected = (payload: { message: string }) => {
      if (graceIntervalRef.current) {
        clearInterval(graceIntervalRef.current);
        graceIntervalRef.current = null;
      }
      setHostGraceSeconds(undefined);
      showToast(payload.message || 'The host has reconnected.');
    };

    const handlePartyChatMessage = (msg: ChatMessage) => {
      setChatMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });

      setLatestChatMessage(msg);

      if (!isChatOpenRef.current) {
        setUnreadChatCount((count) => count + 1);
        // Play subtle ting chime when chat is hidden and message is from another participant
        if (roomStateRef.current?.currentUser.participantId !== msg.senderParticipantId) {
          notificationSound.playChatTing();
        }
      }
    };

    const handleInvitationsUpdated = (payload: { open: boolean }) => {
      showToast(payload.open ? 'Invitations opened.' : 'The invitations are closed 😊');
    };

    const handleParticipantJoinedParty = (payload: { participantId: string; displayName: string }) => {
      if (payload.participantId !== roomStateRef.current?.currentUser.participantId) {
        notificationSound.playJoinTing();
        queueNotification({
          message: `${payload.displayName || 'Someone'} joined the party`,
          icon: 'join',
          type: 'join'
        });
      }
    };

    const handleParticipantLeftParty = (payload: { participantId: string; displayName?: string } | string) => {
      let displayName: string | undefined;
      let participantId: string;
      if (typeof payload === 'string') {
        participantId = payload;
        const p = roomStateRef.current?.party.find((item) => item.participantId === participantId) ||
                  roomStateRef.current?.lounge.find((item) => item.participantId === participantId);
        displayName = p?.displayName;
      } else {
        participantId = payload.participantId;
        displayName = payload.displayName;
      }

      const name = displayName || 'Someone';
      notificationSound.playLeaveTing();
      queueNotification({
        message: `${name} left the room`,
        icon: 'leave',
        type: 'leave'
      });
    };

    const handleParticipantDisconnected = (payload: { participantId: string; displayName?: string }) => {
      const name = payload.displayName || 'Someone';
      notificationSound.playLeaveTing();

      setDisconnectedPeerIds((prev) => {
        const next = new Set(prev);
        next.add(payload.participantId);
        return next;
      });

      // Clear from disconnected set after 6 seconds
      setTimeout(() => {
        setDisconnectedPeerIds((prev) => {
          const next = new Set(prev);
          next.delete(payload.participantId);
          return next;
        });
      }, 6000);

      queueNotification({
        message: `${name} disconnected`,
        icon: 'alert',
        type: 'alert'
      });
    };

    const handleParticipantKicked = (payload: { participantId: string; displayName?: string }) => {
      const name = payload.displayName || 'Someone';
      notificationSound.playLeaveTing();
      queueNotification({
        message: `${name} was removed from the party`,
        icon: 'leave',
        type: 'leave'
      });
    };

    socket.on('room-state-updated', handleRoomStateUpdated);
    socket.on('participant-admitted', handleParticipantAdmitted);
    socket.on('force-muted', handleForceMuted);
    socket.on('kicked', handleKicked);
    socket.on('lounge-cleared', handleLoungeCleared);
    socket.on('removed-from-party', handleRemovedFromParty);
    socket.on('room-ended', handleRoomEnded);
    socket.on('host-changed', handleHostChanged);
    socket.on('host-disconnect-warning', handleHostDisconnectWarning);
    socket.on('host-reconnected', handleHostReconnected);
    socket.on('party-chat-message', handlePartyChatMessage);
    socket.on('invitations-updated', handleInvitationsUpdated);
    socket.on('participant-joined-party', handleParticipantJoinedParty);
    socket.on('participant-left-party', handleParticipantLeftParty);
    socket.on('participant-disconnected', handleParticipantDisconnected);
    socket.on('participant-kicked', handleParticipantKicked);

    return () => {
      socket.off('room-state-updated', handleRoomStateUpdated);
      socket.off('participant-admitted', handleParticipantAdmitted);
      socket.off('force-muted', handleForceMuted);
      socket.off('kicked', handleKicked);
      socket.off('lounge-cleared', handleLoungeCleared);
      socket.off('removed-from-party', handleRemovedFromParty);
      socket.off('room-ended', handleRoomEnded);
      socket.off('host-changed', handleHostChanged);
      socket.off('host-disconnect-warning', handleHostDisconnectWarning);
      socket.off('host-reconnected', handleHostReconnected);
      socket.off('party-chat-message', handlePartyChatMessage);
      socket.off('invitations-updated', handleInvitationsUpdated);
      socket.off('participant-joined-party', handleParticipantJoinedParty);
      socket.off('participant-left-party', handleParticipantLeftParty);
      socket.off('participant-disconnected', handleParticipantDisconnected);
      socket.off('participant-kicked', handleParticipantKicked);
      if (graceIntervalRef.current) clearInterval(graceIntervalRef.current);
    };
  }, [screenState, showToast, isChatOpen, roomState?.currentUser.participantId]);

  // Handle Create Room
  const handleCreateRoom = async (roomName: string, displayName: string) => {
    setIsLoading(true);
    setErrorMessage(undefined);
    const socket = getSocket();

    socket.emit('create-room', { roomName, displayName }, async (res: any) => {
      setIsLoading(false);
      if (res.success && res.roomId && res.sessionToken) {
        storeSessionToken(res.roomId, res.sessionToken);
        try {
          localStorage.setItem(RECENT_ROOM_STORAGE_KEY, JSON.stringify({
            roomId: res.roomId,
            roomName: roomName || `Party ${res.roomId}`,
            displayName,
            timestamp: Date.now()
          }));
        } catch {}
        setRecentRoom(null);

        window.history.pushState({}, '', `/r/${res.roomId}`);
        setScreenState('ROOM');

        if (webrtcEngineRef.current) {
          await webrtcEngineRef.current.startMicrophone();
        }
      } else {
        setErrorMessage(res.error || 'Failed to create room.');
      }
    });
  };

  // Handle Join Room
  const handleJoinRoom = async (roomId: string, displayName: string) => {
    setIsLoading(true);
    setErrorMessage(undefined);
    const socket = getSocket();
    const token = getStoredSessionToken(roomId) || undefined;

    socket.emit('join-room', { roomId, displayName, sessionToken: token }, async (res: any) => {
      setIsLoading(false);
      if (res.success && res.state) {
        if (res.sessionToken) {
          storeSessionToken(roomId, res.sessionToken);
        }
        try {
          localStorage.setItem(RECENT_ROOM_STORAGE_KEY, JSON.stringify({
            roomId,
            roomName: res.state.room?.roomName || res.state.roomName || `Party ${roomId}`,
            displayName,
            timestamp: Date.now()
          }));
        } catch {}
        setRecentRoom(null);

        window.history.pushState({}, '', `/r/${roomId}`);
        setRoomState(res.state);

        if (res.state.currentUser.state === 'QUEUED') {
          setScreenState('QUEUE');
        } else {
          setScreenState('ROOM');
          if (webrtcEngineRef.current) {
            webrtcEngineRef.current.unlockAudio();
            webrtcEngineRef.current.startMicrophone();
          }
        }
      } else {
        if (res.errorCode === 'INVITATIONS_CLOSED') {
          setScreenState('INVITATIONS_CLOSED');
        } else {
          setErrorMessage(res.error || 'Failed to join room.');
        }
      }
    });
  };

  // Host Action: Admit Lounge User
  const handleAdmitParticipant = (targetParticipantId: string) => {
    webrtcEngineRef.current?.unlockAudio();
    const socket = getSocket();
    socket.emit('admit-to-party', { targetParticipantId }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to admit participant.');
      }
    });
  };

  // Host Action: Clear Entire Lounge
  const handleClearLounge = () => {
    const socket = getSocket();
    socket.emit('clear-lounge', (res: any) => {
      if (res.success) {
        showToast(`Cleared ${res.clearedCount || 0} waiting guest(s) from the lounge.`);
      } else {
        showToast(res.error || 'Failed to clear lounge.');
      }
    });
  };


  // Host Action: Transfer Host
  const handleTransferHost = (targetParticipantId: string) => {
    const socket = getSocket();
    socket.emit('transfer-host', { targetParticipantId }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to transfer host.');
      }
    });
  };

  // Host Action: Kick User
  const handleKickParticipant = (targetParticipantId: string) => {
    const socket = getSocket();
    socket.emit('kick-participant', { targetParticipantId }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to kick participant.');
      }
    });
  };

  // Host Action: Remove from Party
  const handleRemoveFromParty = (targetParticipantId: string) => {
    const socket = getSocket();
    socket.emit('remove-from-party', { targetParticipantId }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to remove participant.');
      }
    });
  };

  // Host Action: Toggle Invitations (Stop / Reopen)
  const handleToggleInvitations = (open: boolean) => {
    const socket = getSocket();
    socket.emit('toggle-invitations', { open }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to update invitations.');
      }
    });
  };

  // Host Action: End Room
  const handleEndRoom = () => {
    setIsLoading(true);
    const socket = getSocket();
    socket.emit('end-room', (res: any) => {
      setIsLoading(false);
      setIsEndRoomModalOpen(false);
      setIsHostTransferModalOpen(false);
      if (res.success) {
        if (roomState?.room.roomId) {
          clearStoredSessionToken(roomState.room.roomId);
        }
        try {
          localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
        } catch {}
        setRecentRoom(null);

        if (webrtcEngineRef.current) {
          webrtcEngineRef.current.teardown();
        }
        window.history.pushState({}, '', '/');
        setRoomState(null);
        setScreenState('HOME');
        showToast('Room ended.');
      } else {
        showToast(res.error || 'Failed to end room.');
      }
    });
  };

  // Click on LEAVE PARTY
  const handleLeaveClick = () => {
    const currentUser = roomState?.currentUser;
    const party = roomState?.party || [];

    if (currentUser?.role === 'HOST' && party.length > 1) {
      setIsHostTransferModalOpen(true);
      return;
    }

    handleExecuteLeave();
  };

  const handleExecuteLeave = (options?: { transferToParticipantId?: string; autoTransfer?: boolean }) => {
    const socket = getSocket();
    socket.emit('leave-room', options, () => {
      if (roomState?.room.roomId) {
        clearStoredSessionToken(roomState.room.roomId);
      }
      try {
        localStorage.removeItem(RECENT_ROOM_STORAGE_KEY);
      } catch {}
      setRecentRoom(null);

      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.teardown();
      }
      setIsHostTransferModalOpen(false);
      window.history.pushState({}, '', '/');
      setRoomState(null);
      setScreenState('HOME');
    });
  };

  const handleAutoTransferAndLeave = () => {
    handleExecuteLeave({ autoTransfer: true });
  };

  const handleManualTransferAndLeave = (targetParticipantId: string) => {
    handleExecuteLeave({ transferToParticipantId: targetParticipantId });
  };

  // Send Party Chat Message
  const handleSendChatMessage = (text: string) => {
    const socket = getSocket();
    socket.emit('send-party-chat', { text }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to send message.');
      }
    });
  };

  // Host Drag-and-Drop Party Reordering
  const handleReorderParty = (orderedParticipantIds: string[]) => {
    setRoomState((prev) => {
      if (!prev) return prev;
      const orderMap = new Map(orderedParticipantIds.map((id, index) => [id, index]));
      const sortedParty = [...prev.party].sort((a, b) => {
        const orderA = orderMap.has(a.participantId) ? orderMap.get(a.participantId)! : 999;
        const orderB = orderMap.has(b.participantId) ? orderMap.get(b.participantId)! : 999;
        return orderA - orderB;
      });
      return { ...prev, party: sortedParty };
    });

    const socket = getSocket();
    socket.emit('reorder-party', { orderedParticipantIds }, (res: any) => {
      if (!res?.success) {
        showToast(res?.error || 'Failed to reorder party.');
      }
    });
  };

  // Toggle Microphone
  const handleToggleMicrophone = async () => {
    if (!webrtcEngineRef.current) return;
    webrtcEngineRef.current.unlockAudio();
    if (microphoneState === 'OFF' || microphoneState === 'DENIED') {
      await webrtcEngineRef.current.startMicrophone();
    } else {
      webrtcEngineRef.current.toggleMute();
    }
  };

  // Reset to Home
  const handleReturnHome = () => {
    if (webrtcEngineRef.current) {
      webrtcEngineRef.current.teardown();
    }
    window.history.pushState({}, '', '/');
    setRoomState(null);
    setScreenState('HOME');
  };

  // Render State Screens with 0.5s subtle fade transition
  if (screenState === 'QUEUE') {
    return (
      <div className="ui-fade-transition w-full h-full">
        <QueueScreen
          queuePosition={roomState?.queuePosition}
          onLeaveQueue={handleLeaveClick}
        />
      </div>
    );
  }

  if (screenState === 'INVITATIONS_CLOSED') {
    return (
      <div className="ui-fade-transition w-full h-full">
        <InvitationsClosedScreen onBack={handleReturnHome} />
      </div>
    );
  }

  if (screenState === 'ROOM_ENDED') {
    return (
      <div className="ui-fade-transition w-full h-full">
        <MessageScreen
          title={screenMessage.title}
          badge="ROOM TERMINATED"
          message={screenMessage.message}
          submessage={screenMessage.submessage}
          actionText="RETURN TO STATIC"
          onAction={handleReturnHome}
          icon="ended"
        />
      </div>
    );
  }

  if (screenState === 'REMOVED') {
    return (
      <div className="ui-fade-transition w-full h-full">
        <MessageScreen
          title={screenMessage.title}
          badge="ROOM UPDATE"
          message={screenMessage.message}
          actionText="RETURN TO STATIC"
          onAction={handleReturnHome}
          icon="removed"
        />
      </div>
    );
  }

  if (screenState === 'HOME' || !roomState) {
    return (
      <div className="ui-fade-transition w-full h-full">
        <LandingPage
          onCreateRoom={handleCreateRoom}
          onJoinRoom={handleJoinRoom}
          initialRoomId={initialRoomId}
          isLoading={isLoading}
          errorMessage={errorMessage}
          recentRoom={recentRoom}
          onDismissRecentRoom={handleDismissRecentRoom}
          onToggleDiagnostics={() => setIsDiagnosticsOpen(true)}
        />
      </div>
    );
  }

  const currentUser = roomState.currentUser;
  const isHost = currentUser.role === 'HOST';
  const isInParty = currentUser.state === 'PARTY';

  // Dedicated Zen Lounge View for participants waiting in the lounge
  if (currentUser.state === 'LOUNGE') {
    return (
      <div className="ui-fade-transition w-full h-full">
        <NotificationCapsule
          queue={notificationQueue}
          onDismissCurrent={handleDismissNotification}
        />
        <ZenLoungeView
          displayName={currentUser.displayName}
          partyName={roomState.room.roomName || `Room ${roomState.room.roomId}`}
          roomCode={roomState.room.roomId}
          microphoneState={microphoneState}
          onEnableMic={handleToggleMicrophone}
          onLeaveRoom={handleLeaveClick}
        />
      </div>
    );
  }

  const isLoungeVisible = (typeof window !== 'undefined' && window.innerWidth < 1024) ? isMobileLoungeOpen : !isLoungeCollapsed;

  return (
    <div className="ui-fade-transition flex flex-col h-[100dvh] min-h-[100dvh] w-screen overflow-hidden bg-background bg-static-noise text-static-text font-sans">
      {/* Unified FIFO Top Notification Capsule */}
      <NotificationCapsule
        queue={notificationQueue}
        onDismissCurrent={handleDismissNotification}
      />

      {/* Top Bar Notification Strip (Code removed, reserved for alerts/status) */}
      <TopBar
        roomId={roomState.room.roomId}
        roomName={roomState.room.roomName}
        isHost={isHost}
        invitationsOpen={roomState.room.invitationsOpen}
        connectionStatus={connectionStatus}
        onOpenSettingsModal={() => setIsSettingsModalOpen(true)}
      />

      {/* Microphone Permission Banner if in party and mic is off/denied */}
      {isInParty && (microphoneState === 'OFF' || microphoneState === 'DENIED') && (
        <MicPromptBanner
          onEnableMic={handleToggleMicrophone}
          isDenied={microphoneState === 'DENIED'}
        />
      )}

      {/* Main Split: Party Grid (Full/Center) + Lounge Drawer (Host Only, Collapsible) */}
      <main className="flex-1 flex overflow-hidden">
        <PartyGrid
          roomName={roomState.room.roomName}
          participants={roomState.party}
          currentUserId={currentUser.participantId}
          isHost={isHost}
          onRemoveParticipant={handleRemoveFromParty}
          onTransferHost={handleTransferHost}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          hostGraceSeconds={hostGraceSeconds}
          onReorderParty={handleReorderParty}
          isLoungeCollapsed={!isLoungeVisible}
          onToggleLoungeCollapse={handleToggleLounge}
          loungeCount={roomState.lounge.length}
          peerVolumes={peerVolumes}
          peerQualities={peerQualities}
          disconnectedPeerIds={disconnectedPeerIds}
          onSelectParticipantForAction={setSelectedParticipantForAction}
        />

        {isHost && (
          <LoungeDrawer
            participants={roomState.lounge}
            currentUserId={currentUser.participantId}
            isHost={isHost}
            partyCount={roomState.party.length}
            isOpenMobile={isMobileLoungeOpen}
            onCloseMobile={() => setIsMobileLoungeOpen(false)}
            onAdmitParticipant={handleAdmitParticipant}
            onKickParticipant={handleKickParticipant}
            onClearLounge={handleClearLounge}
            isCollapsed={isLoungeCollapsed}
            onToggleCollapse={() => {
              setIsLoungeCollapsed(true);
              setIsMobileLoungeOpen(false);
            }}
          />
        )}
      </main>

      {/* Floating Bottom Notch HUD with Smartly Integrated Controls */}
      <ControlBar
        microphoneState={microphoneState}
        isInParty={isInParty}
        isHost={isHost}
        loungeCount={isHost ? roomState.lounge.length : 0}
        isLoungeCollapsed={!isLoungeVisible}
        onToggleLoungeCollapse={handleToggleLounge}
        invitationsOpen={roomState.room.invitationsOpen}
        onToggleInvitations={handleToggleInvitations}
        unreadChatCount={unreadChatCount}
        latestChatMessage={latestChatMessage}
        isChatOpen={isChatOpen}
        onToggleMicrophone={handleToggleMicrophone}
        onLeaveRoom={handleLeaveClick}
        onPromptEndRoom={() => setIsEndRoomModalOpen(true)}
        onToggleChat={() => {
          setIsChatOpen(!isChatOpen);
          if (!isChatOpen) {
            setUnreadChatCount(0);
            setLatestChatMessage(null);
          }
        }}
        onOpenShareModal={() => setIsShareModalOpen(true)}
      />

      {/* In-Party Keyboard Text Chat */}
      {isInParty && (
        <PartyChat
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          messages={chatMessages}
          onSendMessage={handleSendChatMessage}
          currentUserId={currentUser.participantId}
        />
      )}

      {/* Modals */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        roomId={roomState.room.roomId}
      />

      <RoomSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        room={roomState.room}
        onToggleInvitations={handleToggleInvitations}
        onPromptEndRoom={() => setIsEndRoomModalOpen(true)}
      />

      <HostTransferModal
        isOpen={isHostTransferModalOpen}
        onClose={() => setIsHostTransferModalOpen(false)}
        partyMembers={roomState.party}
        currentUserId={currentUser.participantId}
        onAutoTransferAndLeave={handleAutoTransferAndLeave}
        onManualTransferAndLeave={handleManualTransferAndLeave}
        onPromptEndRoom={() => setIsEndRoomModalOpen(true)}
      />

      {/* Celebratory Host Promotion Modal */}
      <HostPromotedModal
        isOpen={isHostPromotedModalOpen}
        onClose={() => setIsHostPromotedModalOpen(false)}
      />

      {/* Mobile / Touch Participant Action Sheet (Volume for guests, Host controls for host) */}
      {selectedParticipantForAction && (
        <HostActionSheet
          isOpen={!!selectedParticipantForAction}
          onClose={() => setSelectedParticipantForAction(null)}
          participant={selectedParticipantForAction}
          isCurrentUserHost={isHost}
          connectionQuality={
            selectedParticipantForAction
              ? peerQualities[selectedParticipantForAction.participantId] || peerQualities[selectedParticipantForAction.socketId]
              : undefined
          }
          volume={peerVolumes[selectedParticipantForAction.participantId] ?? 100}
          onVolumeChange={handleVolumeChange}
          onTransferHost={handleTransferHost}
          onRemoveFromParty={handleRemoveFromParty}
          onKickParticipant={handleKickParticipant}
          onShiftLeft={(pid) => handleShiftParticipant(pid, -1)}
          onShiftRight={(pid) => handleShiftParticipant(pid, 1)}
          canShiftLeft={
            (roomState.party.findIndex((p) => p.participantId === selectedParticipantForAction.participantId)) > 0
          }
          canShiftRight={
            (() => {
              const idx = roomState.party.findIndex((p) => p.participantId === selectedParticipantForAction.participantId);
              return idx >= 0 && idx < roomState.party.length - 1;
            })()
          }
        />
      )}

      {/* Developer WebRTC Diagnostics HUD (Ctrl+Shift+D or ?diag=1) */}
      <VoiceDiagnosticsModal
        isOpen={isDiagnosticsOpen}
        onClose={() => setIsDiagnosticsOpen(false)}
        statsMap={diagnosticsStats}
        localMicrophoneState={microphoneState}
        isLocalMuted={microphoneState === 'MUTED'}
        isLocalSpeaking={roomState?.currentUser.isSpeaking ?? false}
        participants={roomState?.party || []}
      />

      <EndRoomModal
        isOpen={isEndRoomModalOpen}
        onClose={() => setIsEndRoomModalOpen(false)}
        onConfirmEnd={handleEndRoom}
        isLoading={isLoading}
      />

      {/* Discreet Version Tag / WebRTC Diagnostics Trigger */}
      <button
        type="button"
        onClick={() => setIsDiagnosticsOpen(true)}
        title="STATIC v1.3.1 • WebRTC Diagnostics HUD"
        className="fixed bottom-1.5 right-3 text-[10px] text-white/20 hover:text-white/50 font-mono tracking-widest select-none z-30 transition-colors cursor-pointer"
      >
        v1.3.1
      </button>
    </div>
  );
}

export default App;

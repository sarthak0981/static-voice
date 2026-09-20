import { useState, useEffect, useRef, useCallback } from 'react';
import confetti from 'canvas-confetti';
import { Volume2 } from 'lucide-react';
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
import { LandingPage } from './components/LandingPage.js';
import { TopBar } from './components/TopBar.js';
import { PartyGrid } from './components/PartyGrid.js';
import { LoungeDrawer } from './components/LoungeDrawer.js';
import { ZenLoungeView } from './components/ZenLoungeView.js';
import { ControlBar } from './components/ControlBar.js';
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
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [hostGraceSeconds, setHostGraceSeconds] = useState<number | undefined>(undefined);
  const graceIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
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
      onAutoplayBlocked: (blocked) => setIsAutoplayBlocked(blocked),
      onError: (msg) => showToast(msg)
    });

    webrtcEngineRef.current = engine;

    return () => {
      engine.teardown();
      webrtcEngineRef.current = null;
    };
  }, [showToast]);

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
      }
    };

    const handleForceMuted = (payload: { reason: string }) => {
      if (webrtcEngineRef.current) {
        webrtcEngineRef.current.forceMute();
      }
      showToast(payload.reason || 'The host muted your microphone.');
    };

    const handleKicked = (payload: { reason: string }) => {
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
        window.history.pushState({}, '', `/r/${roomId}`);
        setRoomState(res.state);

        if (res.state.currentUser.state === 'QUEUED') {
          setScreenState('QUEUE');
        } else {
          setScreenState('ROOM');
          if (res.state.currentUser.state === 'PARTY' && webrtcEngineRef.current) {
            await webrtcEngineRef.current.startMicrophone();
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

  // Host Action: Master Mute
  const handleMuteParticipant = (targetParticipantId: string) => {
    const socket = getSocket();
    socket.emit('mute-participant', { targetParticipantId }, (res: any) => {
      if (!res.success) {
        showToast(res.error || 'Failed to mute participant.');
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
        <ZenLoungeView
          displayName={currentUser.displayName}
          partyName={roomState.room.roomName || `Room ${roomState.room.roomId}`}
          roomCode={roomState.room.roomId}
          onLeaveRoom={handleLeaveClick}
        />
      </div>
    );
  }

  const isLoungeVisible = (typeof window !== 'undefined' && window.innerWidth < 1024) ? isMobileLoungeOpen : !isLoungeCollapsed;

  return (
    <div className="ui-fade-transition flex flex-col h-[100dvh] min-h-[100dvh] w-screen overflow-hidden bg-background bg-static-noise text-static-text font-sans">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-surface-elevated border border-surface-border text-white text-xs font-mono shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 max-w-[calc(100vw-2rem)] truncate">
          {toastMessage}
        </div>
      )}

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

      {/* iOS Safari / Browser Autoplay Blocked Alert Pill */}
      {isAutoplayBlocked && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 animate-bounce">
          <button
            onClick={() => {
              webrtcEngineRef.current?.unlockAudio();
            }}
            className="px-4 py-2 rounded-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs flex items-center gap-2 shadow-xl shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
          >
            <Volume2 className="w-4 h-4" />
            <span>Audio paused by browser • Tap to hear party</span>
          </button>
        </div>
      )}

      {/* Main Split: Party Grid (Full/Center) + Lounge Drawer (Host Only, Collapsible) */}
      <main className="flex-1 flex overflow-hidden">
        <PartyGrid
          roomName={roomState.room.roomName}
          participants={roomState.party}
          currentUserId={currentUser.participantId}
          isHost={isHost}
          onRemoveParticipant={handleRemoveFromParty}
          onMuteParticipant={handleMuteParticipant}
          onTransferHost={handleTransferHost}
          onOpenShareModal={() => setIsShareModalOpen(true)}
          hostGraceSeconds={hostGraceSeconds}
          onReorderParty={handleReorderParty}
          isLoungeCollapsed={!isLoungeVisible}
          onToggleLoungeCollapse={handleToggleLounge}
          loungeCount={roomState.lounge.length}
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

      <EndRoomModal
        isOpen={isEndRoomModalOpen}
        onClose={() => setIsEndRoomModalOpen(false)}
        onConfirmEnd={handleEndRoom}
        isLoading={isLoading}
      />
    </div>
  );
}

export default App;

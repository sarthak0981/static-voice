export type ParticipantRole = 'HOST' | 'GUEST';

export type ParticipantState = 'LOUNGE' | 'PARTY' | 'QUEUED' | 'DISCONNECTED' | 'REMOVED';

export type MicrophoneState = 'ON' | 'MUTED' | 'CONNECTING' | 'DENIED' | 'OFF';

export interface Participant {
  participantId: string;
  socketId: string;
  sessionToken: string;
  displayName: string;
  role: ParticipantRole;
  state: ParticipantState;
  microphoneState: MicrophoneState;
  isSpeaking: boolean;
  joinedAt: number;
  partyJoinedAt?: number;
  queuePosition?: number;
}

export interface RoomSummary {
  roomId: string;
  roomName: string;
  hostId: string;
  invitationsOpen: boolean;
  createdAt: number;
  partyCount: number;
  partyCapacity: number; // 8
  loungeCount: number;
  loungeCapacity: number; // 50
  queueCount: number;
  hostDisconnectGraceSeconds?: number;
}

export interface ChatMessage {
  id: string;
  senderParticipantId: string;
  senderName: string;
  text: string;
  timestamp: number;
  isHost: boolean;
}

export interface ClientRoomState {
  room: RoomSummary;
  currentUser: Participant;
  party: Participant[];
  lounge: Participant[];
  chatHistory: ChatMessage[];
  queuePosition?: number;
}

export interface SignalData {
  targetSocketId: string;
  senderSocketId: string;
  senderParticipantId: string;
  signal: any;
  type: 'offer' | 'answer' | 'ice-candidate';
}

// Client to Server events
export interface ClientToServerEvents {
  'create-room': (
    payload: { roomName?: string; displayName: string; sessionToken?: string },
    callback: (response: { success: boolean; roomId?: string; sessionToken?: string; error?: string }) => void
  ) => void;

  'join-room': (
    payload: { roomId: string; displayName: string; sessionToken?: string },
    callback: (response: {
      success: boolean;
      state?: ClientRoomState;
      sessionToken?: string;
      error?: string;
      errorCode?: 'NOT_FOUND' | 'INVITATIONS_CLOSED' | 'ROOM_FULL' | 'EXPIRED' | 'BLOCKED' | 'INVALID_INPUT';
    }) => void
  ) => void;

  'reconnect-session': (
    payload: { roomId: string; sessionToken: string },
    callback: (response: { success: boolean; state?: ClientRoomState; error?: string }) => void
  ) => void;

  'admit-to-party': (
    payload: { targetParticipantId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'kick-participant': (
    payload: { targetParticipantId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'clear-lounge': (
    callback: (response: { success: boolean; clearedCount?: number; error?: string }) => void
  ) => void;

  'remove-from-party': (
    payload: { targetParticipantId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'mute-participant': (
    payload: { targetParticipantId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'transfer-host': (
    payload: { targetParticipantId: string },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'toggle-invitations': (
    payload: { open: boolean },
    callback: (response: { success: boolean; open?: boolean; error?: string }) => void
  ) => void;

  'end-room': (
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'leave-room': (
    payload: { transferToParticipantId?: string; autoTransfer?: boolean } | undefined,
    callback: (response: { success: boolean }) => void
  ) => void;

  'update-mic-state': (
    payload: { microphoneState: MicrophoneState }
  ) => void;

  'update-speaking': (
    payload: { isSpeaking: boolean }
  ) => void;

  'signal-peer': (
    payload: { targetSocketId: string; targetParticipantId?: string; signal: any; type: 'offer' | 'answer' | 'ice-candidate' }
  ) => void;

  'send-party-chat': (
    payload: { text: string },
    callback: (response: { success: boolean; message?: ChatMessage; error?: string }) => void
  ) => void;

  'reorder-party': (
    payload: { orderedParticipantIds: string[] },
    callback: (response: { success: boolean; error?: string }) => void
  ) => void;

  'get-ice-config': (
    callback: (response: { iceServers: Array<{ urls: string | string[]; username?: string; credential?: string }> }) => void
  ) => void;
}

// Server to Client events
export interface ServerToClientEvents {
  'room-state-updated': (state: ClientRoomState) => void;
  'participant-joined-party': (participant: Participant) => void;
  'participant-left-party': (payload: { participantId: string; displayName?: string } | string) => void;
  'participant-admitted': (participant: Participant) => void;
  'queue-position-updated': (payload: { position: number }) => void;
  'kicked': (payload: { reason: string }) => void;
  'lounge-cleared': (payload: { reason: string }) => void;
  'removed-from-party': (payload: { reason: string }) => void;
  'force-muted': (payload: { reason: string }) => void;
  'room-ended': (payload: { reason: string }) => void;
  'host-changed': (payload: { newHostId: string; message: string }) => void;
  'host-disconnect-warning': (payload: { secondsRemaining: number; message: string }) => void;
  'host-reconnected': (payload: { hostId: string; message: string }) => void;
  'invitations-updated': (payload: { open: boolean }) => void;
  'signal-received': (payload: SignalData) => void;
  'peer-ready-for-offer': (payload: { socketId: string; participantId: string }) => void;
  'party-chat-message': (message: ChatMessage) => void;
}

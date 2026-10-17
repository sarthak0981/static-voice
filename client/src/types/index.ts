export type ParticipantRole = 'HOST' | 'GUEST';

export type ParticipantState = 'LOUNGE' | 'PARTY' | 'QUEUED' | 'DISCONNECTED' | 'REMOVED';

export type MicrophoneState = 'ON' | 'MUTED' | 'CONNECTING' | 'DENIED' | 'OFF';

export type ConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'OFFLINE';

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
  isHandRaised?: boolean;
  isHostMuted?: boolean;
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
  roomId?: string;
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

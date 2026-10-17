import crypto from 'node:crypto';
import {
  Participant,
  ParticipantRole,
  ParticipantState,
  MicrophoneState,
  RoomSummary,
  ClientRoomState,
  ChatMessage
} from './types.js';
import {
  validateAndSanitizeUsername,
  validateAndSanitizeRoomName,
  validateAndSanitizeRoomCode
} from './validators.js';
import { RoomStore, InMemoryRoomStore } from './roomStore.js';

export const PARTY_CAPACITY = 8;
export const LOUNGE_CAPACITY = 50;
export const MAX_QUEUE_CAPACITY = 200;
const ROOM_ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
export const HOST_GRACE_PERIOD_MS = 8000;

export class RoomMutex {
  private queue: Array<() => void> = [];
  private locked: boolean = false;

  public async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    await new Promise<void>((resolve) => {
      if (!this.locked) {
        this.locked = true;
        resolve();
      } else {
        this.queue.push(resolve);
      }
    });
    try {
      return await fn();
    } finally {
      if (this.queue.length > 0) {
        const next = this.queue.shift()!;
        next();
      } else {
        this.locked = false;
      }
    }
  }
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function verifySessionTokenHash(candidateToken: string, storedHash: string): boolean {
  if (!candidateToken || !storedHash) return false;
  const candidateHash = hashSessionToken(candidateToken);
  try {
    const a = Buffer.from(candidateHash, 'hex');
    const b = Buffer.from(storedHash, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch (_) {
    return false;
  }
}

export interface InternalRoom {
  roomId: string;
  roomName: string;
  hostId: string;
  invitationsOpen: boolean;
  createdAt: number;
  lastActivity: number;
  participants: Map<string, Participant>;
  socketToParticipant: Map<string, string>;
  tokenToParticipant: Map<string, string>; // Maps SHA-256 hash -> participantId
  queue: string[];
  chatHistory: ChatMessage[];
  partyOrder?: string[];
  inactivityTimer?: NodeJS.Timeout;
  hostGraceTimer?: NodeJS.Timeout;
  disconnectedHostId?: string;
  hostDisconnectGraceSeconds?: number;
  mutex: RoomMutex;
}

export class RoomManager {
  private rooms: RoomStore;
  private zombieReaperTimer: NodeJS.Timeout;

  constructor(store?: RoomStore) {
    this.rooms = store || new InMemoryRoomStore();
    this.zombieReaperTimer = setInterval(() => {
      this.pruneZombieParticipants();
    }, 60000);
  }

  public getRoomCount(): number {
    return this.rooms.count();
  }

  public generateRoomId(): string {
    let id = '';
    const bytes = crypto.randomBytes(6);
    for (let i = 0; i < 6; i++) {
      id += ROOM_ID_CHARS[bytes[i] % ROOM_ID_CHARS.length];
    }
    if (this.rooms.has(id)) {
      return this.generateRoomId();
    }
    return id;
  }

  public generateSessionToken(): string {
    return crypto.randomBytes(24).toString('hex');
  }

  public generateParticipantId(): string {
    return 'p_' + crypto.randomBytes(8).toString('hex');
  }

  private resolveUniqueDisplayName(room: InternalRoom, baseName: string): string {
    const existingNames = new Set(
      Array.from(room.participants.values()).map((p) => p.displayName.toLowerCase())
    );

    if (!existingNames.has(baseName.toLowerCase())) {
      return baseName;
    }

    let counter = 2;
    while (existingNames.has(`${baseName} #${counter}`.toLowerCase())) {
      counter++;
    }
    return `${baseName} #${counter}`;
  }

  public createRoom(
    socketId: string,
    roomName?: string,
    displayName?: string,
    existingToken?: string
  ): {
    room: InternalRoom;
    participant: Participant;
  } {
    const validation = validateAndSanitizeUsername(displayName || '');
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid username');
    }

    const roomNameValidation = validateAndSanitizeRoomName(roomName);
    if (!roomNameValidation.isValid) {
      throw new Error(roomNameValidation.error || 'Invalid room name');
    }

    const roomId = this.generateRoomId();
    const participantId = this.generateParticipantId();
    const rawSessionToken = existingToken || this.generateSessionToken();
    const tokenHash = hashSessionToken(rawSessionToken);
    const now = Date.now();
    const cleanRoomName = roomNameValidation.normalized;

    const hostParticipant: Participant = {
      participantId,
      socketId,
      sessionToken: rawSessionToken,
      displayName: validation.normalized,
      role: 'HOST',
      state: 'PARTY',
      microphoneState: 'MUTED',
      isSpeaking: false,
      joinedAt: now,
      partyJoinedAt: now
    };

    const room: InternalRoom = {
      roomId,
      roomName: cleanRoomName,
      hostId: participantId,
      invitationsOpen: true,
      createdAt: now,
      lastActivity: now,
      participants: new Map([[participantId, hostParticipant]]),
      socketToParticipant: new Map([[socketId, participantId]]),
      tokenToParticipant: new Map([[tokenHash, participantId]]),
      queue: [],
      chatHistory: [],
      partyOrder: [participantId],
      mutex: new RoomMutex()
    };

    this.rooms.set(roomId, room);
    return { room, participant: hostParticipant };
  }

  public getRoom(roomId: string): InternalRoom | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  public getAllRooms(): IterableIterator<InternalRoom> {
    return this.rooms.values();
  }

  private findParticipantByToken(
    room: InternalRoom,
    rawToken: string
  ): { participant?: Participant; tokenHash?: string } {
    if (!rawToken) return {};

    for (const [storedHash, pId] of room.tokenToParticipant.entries()) {
      if (verifySessionTokenHash(rawToken, storedHash) || storedHash === rawToken) {
        const participant = room.participants.get(pId);
        return { participant, tokenHash: storedHash };
      }
    }
    return {};
  }

  public joinRoom(
    rawRoomId: string,
    socketId: string,
    displayName: string,
    existingToken?: string
  ): {
    success: boolean;
    participant?: Participant;
    room?: InternalRoom;
    error?: string;
    errorCode?: 'NOT_FOUND' | 'INVITATIONS_CLOSED' | 'ROOM_FULL' | 'EXPIRED' | 'BLOCKED' | 'INVALID_INPUT';
    hostReconnected?: boolean;
    supersededSocketId?: string;
  } {
    const codeValidation = validateAndSanitizeRoomCode(rawRoomId);
    if (!codeValidation.isValid) {
      return { success: false, error: codeValidation.error, errorCode: 'INVALID_INPUT' };
    }
    const roomId = codeValidation.normalized;
    const room = this.rooms.get(roomId);

    if (!room) {
      return { success: false, error: "We couldn't find that room.", errorCode: 'NOT_FOUND' };
    }

    this.touchRoom(room);

    // 1. Reconnecting with existing session token (with SHA-256 validation & token rotation)
    if (existingToken) {
      const { participant: existingParticipant, tokenHash: matchedHash } = this.findParticipantByToken(
        room,
        existingToken
      );

      if (existingParticipant && existingParticipant.state !== 'REMOVED') {
        const supersededSocketId =
          existingParticipant.socketId && existingParticipant.socketId !== socketId
            ? existingParticipant.socketId
            : undefined;

        // Token rotation: generate fresh token, store new hash, delete old hash
        const newRawToken = this.generateSessionToken();
        const newHash = hashSessionToken(newRawToken);

        if (matchedHash) {
          room.tokenToParticipant.delete(matchedHash);
        }
        room.tokenToParticipant.set(newHash, existingParticipant.participantId);
        existingParticipant.sessionToken = newRawToken;

        room.socketToParticipant.delete(existingParticipant.socketId);
        existingParticipant.socketId = socketId;
        room.socketToParticipant.set(socketId, existingParticipant.participantId);

        let hostReconnected = false;
        if (room.disconnectedHostId === existingParticipant.participantId) {
          if (room.hostGraceTimer) {
            clearTimeout(room.hostGraceTimer);
            room.hostGraceTimer = undefined;
          }
          room.disconnectedHostId = undefined;
          room.hostDisconnectGraceSeconds = undefined;
          hostReconnected = true;
        }

        return {
          success: true,
          participant: existingParticipant,
          room,
          hostReconnected,
          supersededSocketId
        };
      }
    }

    // 2. Check if invitations are stopped
    if (!room.invitationsOpen) {
      return {
        success: false,
        error: 'The invitations are closed 😊',
        errorCode: 'INVITATIONS_CLOSED'
      };
    }

    const nameValidation = validateAndSanitizeUsername(displayName || '');
    if (!nameValidation.isValid) {
      return { success: false, error: nameValidation.error, errorCode: 'INVALID_INPUT' };
    }

    const uniqueName = this.resolveUniqueDisplayName(room, nameValidation.normalized);
    const loungeParticipants = this.getLoungeParticipants(room);
    const participantId = this.generateParticipantId();
    const rawSessionToken = this.generateSessionToken();
    const tokenHash = hashSessionToken(rawSessionToken);

    let state: ParticipantState = 'LOUNGE';
    let queuePosition: number | undefined;

    if (loungeParticipants.length >= LOUNGE_CAPACITY) {
      if (room.queue.length >= MAX_QUEUE_CAPACITY) {
        return {
          success: false,
          error: 'The room waiting queue is currently full. Please try again later.',
          errorCode: 'ROOM_FULL'
        };
      }
      state = 'QUEUED';
      room.queue.push(participantId);
      queuePosition = room.queue.length;
    }

    const participant: Participant = {
      participantId,
      socketId,
      sessionToken: rawSessionToken,
      displayName: uniqueName,
      role: 'GUEST',
      state,
      microphoneState: 'MUTED',
      isSpeaking: false,
      joinedAt: Date.now(),
      queuePosition,
      isHandRaised: false,
      isHostMuted: false
    };

    room.participants.set(participantId, participant);
    room.socketToParticipant.set(socketId, participantId);
    room.tokenToParticipant.set(tokenHash, participantId);

    return { success: true, participant, room };
  }

  public admitToParty(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): {
    success: boolean;
    admittedParticipant?: Participant;
    promotedParticipant?: Participant;
    queuePromotedParticipant?: Participant;
    error?: string;
  } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can admit participants.' };
    }

    const party = this.getPartyParticipants(room);
    if (party.length >= PARTY_CAPACITY) {
      return { success: false, error: 'Party is already full (max 8 speakers).' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target) {
      return { success: false, error: 'Participant not found.' };
    }

    if (target.state !== 'LOUNGE') {
      return { success: false, error: 'Only participants in the Lounge can be admitted to the Party.' };
    }

    target.state = 'PARTY';
    target.partyJoinedAt = Date.now();
    target.isHandRaised = false;

    if (!room.partyOrder) {
      room.partyOrder = this.getPartyParticipants(room).map((p) => p.participantId);
    } else if (!room.partyOrder.includes(target.participantId)) {
      room.partyOrder.push(target.participantId);
    }

    const queuePromoted = this.promoteNextQueuedUser(room);
    this.touchRoom(room);

    return {
      success: true,
      admittedParticipant: target,
      promotedParticipant: target,
      queuePromotedParticipant: queuePromoted
    };
  }

  public clearLounge(
    room: InternalRoom,
    hostSocketId: string
  ): { success: boolean; clearedParticipants: Participant[]; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, clearedParticipants: [], error: 'Only the host can clear the lounge.' };
    }

    const cleared: Participant[] = [];
    for (const p of room.participants.values()) {
      if (p.state === 'LOUNGE' || p.state === 'QUEUED') {
        cleared.push(p);
      }
    }

    for (const p of cleared) {
      this.removeParticipantInternal(room, p.participantId);
      p.state = 'REMOVED';
    }

    room.queue = [];
    this.touchRoom(room);

    return { success: true, clearedParticipants: cleared };
  }

  public muteParticipant(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): { success: boolean; mutedParticipant?: Participant; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can mute participants.' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target || target.state !== 'PARTY') {
      return { success: false, error: 'Participant is not in the party.' };
    }

    target.isHostMuted = true;
    target.microphoneState = 'MUTED';
    target.isSpeaking = false;
    this.touchRoom(room);

    return { success: true, mutedParticipant: target };
  }

  public unmuteParticipant(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): { success: boolean; unmutedParticipant?: Participant; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can unmute participants.' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target || target.state !== 'PARTY') {
      return { success: false, error: 'Participant is not in the party.' };
    }

    target.isHostMuted = false;
    this.touchRoom(room);

    return { success: true, unmutedParticipant: target };
  }

  public toggleRaiseHand(
    room: InternalRoom,
    socketId: string
  ): { success: boolean; participant?: Participant; error?: string } {
    const participant = this.getParticipantBySocket(room, socketId);
    if (!participant || participant.state !== 'PARTY') {
      return { success: false, error: 'Only party members can raise hand.' };
    }

    participant.isHandRaised = !participant.isHandRaised;
    this.touchRoom(room);

    return { success: true, participant };
  }

  public transferHost(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): { success: boolean; oldHost?: Participant; newHost?: Participant; error?: string } {
    const currentHost = this.getParticipantBySocket(room, hostSocketId);
    if (!currentHost || currentHost.role !== 'HOST') {
      return { success: false, error: 'Only the current host can transfer host ownership.' };
    }

    if (currentHost.participantId === targetParticipantId) {
      return { success: false, error: 'You are already the host.' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target || target.state !== 'PARTY') {
      return { success: false, error: 'Target must be an active party member to become host.' };
    }

    currentHost.role = 'GUEST';
    target.role = 'HOST';
    room.hostId = target.participantId;
    this.touchRoom(room);

    return { success: true, oldHost: currentHost, newHost: target };
  }

  public kickParticipant(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): {
    success: boolean;
    kickedParticipant?: Participant;
    wasInLounge?: boolean;
    queuePromotedParticipant?: Participant;
    error?: string;
  } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can kick participants.' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target) {
      return { success: false, error: 'Participant not found or already left.' };
    }

    if (target.role === 'HOST') {
      return { success: false, error: 'Host cannot be kicked.' };
    }

    const wasInLounge = target.state === 'LOUNGE';
    const wasInQueue = target.state === 'QUEUED';

    this.removeParticipantInternal(room, targetParticipantId);
    target.state = 'REMOVED';

    if (wasInQueue) {
      this.recalculateQueuePositions(room);
    }

    let queuePromoted: Participant | undefined;
    if (wasInLounge) {
      queuePromoted = this.promoteNextQueuedUser(room);
    }

    this.touchRoom(room);
    return {
      success: true,
      kickedParticipant: target,
      wasInLounge,
      queuePromotedParticipant: queuePromoted
    };
  }

  public removeFromParty(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): {
    success: boolean;
    removedParticipant?: Participant;
    error?: string;
  } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can remove Party members.' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target) {
      return { success: false, error: 'Participant not found or already left.' };
    }

    if (target.role === 'HOST') {
      return { success: false, error: 'Host cannot remove themselves from the Party.' };
    }

    if (target.state !== 'PARTY') {
      return { success: false, error: 'Participant is not currently in the Party.' };
    }

    this.removeParticipantInternal(room, targetParticipantId);
    target.state = 'REMOVED';
    this.touchRoom(room);

    return { success: true, removedParticipant: target };
  }

  public findLongestActivePartyMember(
    room: InternalRoom,
    excludeParticipantId?: string
  ): Participant | undefined {
    const party = this.getPartyParticipants(room).filter(
      (p) => p.participantId !== excludeParticipantId
    );
    if (party.length === 0) return undefined;

    party.sort((a, b) => {
      const aTime = a.partyJoinedAt || a.joinedAt;
      const bTime = b.partyJoinedAt || b.joinedAt;
      return aTime - bTime;
    });

    return party[0];
  }

  public leaveRoom(
    room: InternalRoom,
    socketId: string,
    options?: { transferToParticipantId?: string; autoTransfer?: boolean }
  ): {
    success: boolean;
    leavingParticipant?: Participant;
    newHost?: Participant;
    queuePromotedParticipant?: Participant;
  } {
    const participantId = room.socketToParticipant.get(socketId);
    if (!participantId) {
      return { success: false };
    }

    const participant = room.participants.get(participantId);
    if (!participant) {
      return { success: false };
    }

    const wasHost = participant.role === 'HOST';
    const wasInLounge = participant.state === 'LOUNGE';
    const wasInQueue = participant.state === 'QUEUED';

    let newHost: Participant | undefined;

    if (wasHost) {
      if (options?.transferToParticipantId) {
        const manualTarget = room.participants.get(options.transferToParticipantId);
        if (manualTarget && manualTarget.state === 'PARTY') {
          manualTarget.role = 'HOST';
          room.hostId = manualTarget.participantId;
          newHost = manualTarget;
        }
      }

      if (!newHost && (options?.autoTransfer || !options?.transferToParticipantId)) {
        const longest = this.findLongestActivePartyMember(room, participantId);
        if (longest) {
          longest.role = 'HOST';
          room.hostId = longest.participantId;
          newHost = longest;
        }
      }
    }

    this.removeParticipantInternal(room, participantId);

    if (wasInQueue) {
      this.recalculateQueuePositions(room);
    }

    let queuePromoted: Participant | undefined;
    if (wasInLounge) {
      queuePromoted = this.promoteNextQueuedUser(room);
    }

    this.touchRoom(room);
    return {
      success: true,
      leavingParticipant: participant,
      newHost,
      queuePromotedParticipant: queuePromoted
    };
  }

  public migrateHostImmediately(room: InternalRoom): Participant | undefined {
    const candidate = this.findLongestActivePartyMember(room);
    if (candidate) {
      candidate.role = 'HOST';
      room.hostId = candidate.participantId;
      return candidate;
    }

    const lounge = this.getLoungeParticipants(room);
    if (lounge.length > 0) {
      lounge.sort((a, b) => a.joinedAt - b.joinedAt);
      const newHost = lounge[0];
      newHost.role = 'HOST';
      newHost.state = 'PARTY';
      newHost.partyJoinedAt = Date.now();
      room.hostId = newHost.participantId;
      return newHost;
    }

    return undefined;
  }

  public getRoomAndParticipantBySocketId(
    socketId: string
  ): { room: InternalRoom; participant: Participant } | undefined {
    for (const room of this.rooms.values()) {
      const pId = room.socketToParticipant.get(socketId);
      if (pId) {
        const participant = room.participants.get(pId);
        if (participant) {
          return { room, participant };
        }
      }
    }
    return undefined;
  }

  public handleUnexpectedDisconnect(
    socketId: string,
    onGracePeriodExpire: (room: InternalRoom, newHost?: Participant) => void
  ): {
    room?: InternalRoom;
    participant?: Participant;
    isHostGracePeriod?: boolean;
    graceSeconds?: number;
    newHost?: Participant;
    queuePromotedParticipant?: Participant;
  } {
    for (const room of this.rooms.values()) {
      const pId = room.socketToParticipant.get(socketId);
      if (!pId) continue;

      const participant = room.participants.get(pId);
      if (!participant) continue;

      if (participant.role === 'HOST') {
        const otherParty = this.getPartyParticipants(room).filter((p) => p.participantId !== pId);
        const lounge = this.getLoungeParticipants(room);

        if (otherParty.length > 0 || lounge.length > 0) {
          room.disconnectedHostId = pId;
          room.hostDisconnectGraceSeconds = 8; // 8 seconds host grace period

          if (room.hostGraceTimer) {
            clearTimeout(room.hostGraceTimer);
          }

          room.hostGraceTimer = setTimeout(() => {
            room.hostGraceTimer = undefined;
            room.disconnectedHostId = undefined;
            room.hostDisconnectGraceSeconds = undefined;

            this.removeParticipantInternal(room, pId);
            const newHost = this.migrateHostImmediately(room);
            this.touchRoom(room);
            onGracePeriodExpire(room, newHost);
          }, HOST_GRACE_PERIOD_MS);

          return {
            room,
            participant,
            isHostGracePeriod: true,
            graceSeconds: 8
          };
        } else {
          // Sole occupant host: keep room intact with touch timer
          participant.state = 'DISCONNECTED';
          this.touchRoom(room);
          return {
            room,
            participant,
            isHostGracePeriod: false
          };
        }
      }

      participant.state = 'DISCONNECTED';
      this.touchRoom(room);
      return { room, participant };
    }

    return {};
  }

  public endRoom(
    room: InternalRoom,
    hostSocketId: string
  ): { success: boolean; allParticipants: Participant[]; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, allParticipants: [], error: 'Only the host can end the room.' };
    }

    const all = Array.from(room.participants.values());
    if (room.inactivityTimer) {
      clearTimeout(room.inactivityTimer);
      room.inactivityTimer = undefined;
    }
    if (room.hostGraceTimer) {
      clearTimeout(room.hostGraceTimer);
      room.hostGraceTimer = undefined;
    }

    room.participants.clear();
    room.socketToParticipant.clear();
    room.tokenToParticipant.clear();
    room.chatHistory = [];
    if (room.partyOrder) room.partyOrder = [];

    this.rooms.delete(room.roomId);
    return { success: true, allParticipants: all };
  }

  public toggleInvitations(
    room: InternalRoom,
    hostSocketId: string,
    open: boolean
  ): { success: boolean; open?: boolean; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can change invitation status.' };
    }

    room.invitationsOpen = open;
    this.touchRoom(room);
    return { success: true, open: room.invitationsOpen };
  }

  public updateMicrophoneState(
    room: InternalRoom,
    socketId: string,
    state: MicrophoneState
  ): Participant | undefined {
    const participant = this.getParticipantBySocket(room, socketId);
    if (participant) {
      if (participant.isHostMuted && state === 'ON') {
        participant.microphoneState = 'MUTED';
        participant.isSpeaking = false;
        return participant;
      }
      participant.microphoneState = state;
      if (state === 'MUTED' || state === 'OFF' || state === 'DENIED') {
        participant.isSpeaking = false;
      }
      this.touchRoom(room);
    }
    return participant;
  }

  public updateSpeaking(
    room: InternalRoom,
    socketId: string,
    isSpeaking: boolean
  ): Participant | undefined {
    const participant = this.getParticipantBySocket(room, socketId);
    if (participant) {
      participant.isSpeaking = isSpeaking;
    }
    return participant;
  }

  public reorderParty(
    room: InternalRoom,
    hostSocketId: string,
    orderedIds: string[]
  ): { success: boolean; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can reorder party members.' };
    }

    const currentParty = this.getPartyParticipants(room);
    const currentIds = new Set(currentParty.map((p) => p.participantId));

    if (orderedIds.length !== currentParty.length) {
      return { success: false, error: 'Reordered list must contain all party members.' };
    }

    for (const id of orderedIds) {
      if (!currentIds.has(id)) {
        return { success: false, error: 'Invalid participant ID in reorder list.' };
      }
    }

    room.partyOrder = [...orderedIds];
    this.touchRoom(room);
    return { success: true };
  }

  public addChatMessage(
    room: InternalRoom,
    msgOrSenderId: ChatMessage | string,
    senderName?: string,
    text?: string,
    isHost?: boolean
  ): ChatMessage {
    let message: ChatMessage;
    if (typeof msgOrSenderId === 'object') {
      message = msgOrSenderId;
    } else {
      message = {
        id: crypto.randomUUID(),
        roomId: room.roomId,
        senderParticipantId: msgOrSenderId,
        senderName: senderName || 'Anonymous',
        text: text || '',
        timestamp: Date.now(),
        isHost: !!isHost
      };
    }

    room.chatHistory.push(message);
    if (room.chatHistory.length > 100) {
      room.chatHistory.shift();
    }

    this.touchRoom(room);
    return message;
  }

  private promoteNextQueuedUser(room: InternalRoom): Participant | undefined {
    if (room.queue.length === 0) return undefined;

    const loungeParticipants = this.getLoungeParticipants(room);
    if (loungeParticipants.length >= LOUNGE_CAPACITY) return undefined;

    const nextId = room.queue.shift();
    if (!nextId) return undefined;

    const participant = room.participants.get(nextId);
    if (participant && participant.state === 'QUEUED') {
      participant.state = 'LOUNGE';
      participant.queuePosition = undefined;
      this.recalculateQueuePositions(room);
      return participant;
    }

    return undefined;
  }

  private recalculateQueuePositions(room: InternalRoom): void {
    const validQueue: string[] = [];
    room.queue.forEach((id) => {
      const p = room.participants.get(id);
      if (p && p.state === 'QUEUED') {
        validQueue.push(id);
        p.queuePosition = validQueue.length;
      }
    });
    room.queue = validQueue;
  }

  private removeParticipantInternal(room: InternalRoom, participantId: string): void {
    const p = room.participants.get(participantId);
    if (p) {
      room.socketToParticipant.delete(p.socketId);
      for (const [hash, id] of room.tokenToParticipant.entries()) {
        if (id === participantId) {
          room.tokenToParticipant.delete(hash);
        }
      }
      room.participants.delete(participantId);
    }
    room.queue = room.queue.filter((id) => id !== participantId);
    if (room.partyOrder) {
      room.partyOrder = room.partyOrder.filter((id) => id !== participantId);
    }
  }

  private touchRoom(room: InternalRoom): void {
    room.lastActivity = Date.now();
    if (room.inactivityTimer) {
      clearTimeout(room.inactivityTimer);
    }

    room.inactivityTimer = setTimeout(() => {
      if (this.rooms.has(room.roomId)) {
        if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
        if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
        this.rooms.delete(room.roomId);
      }
    }, INACTIVITY_TIMEOUT_MS);
  }

  public getPartyParticipants(room: InternalRoom): Participant[] {
    const list = Array.from(room.participants.values()).filter((p) => p.state === 'PARTY');
    if (!room.partyOrder || room.partyOrder.length === 0) {
      return list;
    }
    const orderMap = new Map(room.partyOrder.map((id, index) => [id, index]));
    return list.sort((a, b) => {
      const orderA = orderMap.get(a.participantId) ?? 999;
      const orderB = orderMap.get(b.participantId) ?? 999;
      return orderA - orderB;
    });
  }

  public getLoungeParticipants(room: InternalRoom): Participant[] {
    return Array.from(room.participants.values()).filter((p) => p.state === 'LOUNGE');
  }

  public getParticipantBySocket(room: InternalRoom, socketId: string): Participant | undefined {
    const pId = room.socketToParticipant.get(socketId);
    return pId ? room.participants.get(pId) : undefined;
  }

  public getRoomSummary(room: InternalRoom): RoomSummary {
    const party = this.getPartyParticipants(room);
    const lounge = this.getLoungeParticipants(room);

    return {
      roomId: room.roomId,
      roomName: room.roomName,
      hostId: room.hostId,
      invitationsOpen: room.invitationsOpen,
      createdAt: room.createdAt,
      partyCount: party.length,
      partyCapacity: PARTY_CAPACITY,
      loungeCount: lounge.length,
      loungeCapacity: LOUNGE_CAPACITY,
      queueCount: room.queue.length,
      hostDisconnectGraceSeconds: room.hostDisconnectGraceSeconds
    };
  }

  public getClientRoomState(room: InternalRoom, currentParticipant: Participant): ClientRoomState {
    return {
      room: this.getRoomSummary(room),
      currentUser: currentParticipant,
      party: this.getPartyParticipants(room),
      lounge: this.getLoungeParticipants(room),
      chatHistory: room.chatHistory,
      queuePosition: currentParticipant.queuePosition
    };
  }

  /**
   * Periodic reaper for zombie participants in DISCONNECTED state for > 60s
   */
  public pruneZombieParticipants(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      for (const [pId, p] of room.participants.entries()) {
        if (p.state === 'DISCONNECTED') {
          if (room.disconnectedHostId === pId && room.hostGraceTimer) {
            continue;
          }
          if (now - p.joinedAt > 60000) {
            this.removeParticipantInternal(room, pId);
          }
        }
      }
    }
  }

  public destroy(): void {
    clearInterval(this.zombieReaperTimer);
    for (const room of this.rooms.values()) {
      if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
    }
    this.rooms.clear();
  }
}

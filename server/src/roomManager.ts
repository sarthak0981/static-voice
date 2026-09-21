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

export const PARTY_CAPACITY = 8;
export const LOUNGE_CAPACITY = 50;
const ROOM_ID_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000;
export const HOST_GRACE_PERIOD_MS = 8000;

export interface InternalRoom {
  roomId: string;
  roomName: string;
  hostId: string;
  invitationsOpen: boolean;
  createdAt: number;
  lastActivity: number;
  participants: Map<string, Participant>;
  socketToParticipant: Map<string, string>;
  tokenToParticipant: Map<string, string>;
  queue: string[];
  chatHistory: ChatMessage[];
  partyOrder?: string[];
  inactivityTimer?: NodeJS.Timeout;
  hostGraceTimer?: NodeJS.Timeout;
  disconnectedHostId?: string;
  hostDisconnectGraceSeconds?: number;
}

export class RoomManager {
  private rooms: Map<string, InternalRoom> = new Map();

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

  /**
   * Ensures username uniqueness in room by appending #2, #3 if necessary
   */
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
    const sessionToken = existingToken || this.generateSessionToken();
    const now = Date.now();
    const cleanRoomName = roomNameValidation.normalized;

    const hostParticipant: Participant = {
      participantId,
      socketId,
      sessionToken,
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
      tokenToParticipant: new Map([[sessionToken, participantId]]),
      queue: [],
      chatHistory: [],
      partyOrder: [participantId]
    };

    this.rooms.set(roomId, room);
    return { room, participant: hostParticipant };
  }

  public getRoom(roomId: string): InternalRoom | undefined {
    return this.rooms.get(roomId.toUpperCase());
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

    // Reconnecting with existing session token
    if (existingToken && room.tokenToParticipant.has(existingToken)) {
      const pId = room.tokenToParticipant.get(existingToken)!;
      const existingParticipant = room.participants.get(pId);
      if (existingParticipant && existingParticipant.state !== 'REMOVED') {
        room.socketToParticipant.delete(existingParticipant.socketId);
        existingParticipant.socketId = socketId;
        room.socketToParticipant.set(socketId, pId);

        let hostReconnected = false;
        if (room.disconnectedHostId === pId) {
          if (room.hostGraceTimer) {
            clearTimeout(room.hostGraceTimer);
            room.hostGraceTimer = undefined;
          }
          room.disconnectedHostId = undefined;
          room.hostDisconnectGraceSeconds = undefined;
          hostReconnected = true;
        }

        return { success: true, participant: existingParticipant, room, hostReconnected };
      }
    }

    // Check if invitations are stopped
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
    const sessionToken = existingToken || this.generateSessionToken();

    let state: ParticipantState = 'LOUNGE';
    let queuePosition: number | undefined;

    if (loungeParticipants.length >= LOUNGE_CAPACITY) {
      state = 'QUEUED';
      room.queue.push(participantId);
      queuePosition = room.queue.length;
    }

    const newParticipant: Participant = {
      participantId,
      socketId,
      sessionToken,
      displayName: uniqueName,
      role: 'GUEST',
      state,
      microphoneState: 'OFF',
      isSpeaking: false,
      joinedAt: Date.now(),
      queuePosition
    };

    room.participants.set(participantId, newParticipant);
    room.socketToParticipant.set(socketId, participantId);
    room.tokenToParticipant.set(sessionToken, participantId);

    return { success: true, participant: newParticipant, room };
  }

  public admitToParty(
    room: InternalRoom,
    hostSocketId: string,
    targetParticipantId: string
  ): {
    success: boolean;
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
      return { success: false, error: 'The party is packed! 🎉' };
    }

    const target = room.participants.get(targetParticipantId);
    if (!target) {
      return { success: false, error: 'Participant not found.' };
    }

    if (target.state !== 'LOUNGE') {
      return { success: false, error: 'Participant is not in the Lounge.' };
    }

    target.state = 'PARTY';
    target.partyJoinedAt = Date.now();
    target.microphoneState = 'MUTED';

    if (!room.partyOrder) {
      room.partyOrder = [];
    }
    if (!room.partyOrder.includes(targetParticipantId)) {
      room.partyOrder.push(targetParticipantId);
    }

    this.touchRoom(room);

    const queuePromoted = this.promoteNextQueuedUser(room);

    return {
      success: true,
      promotedParticipant: target,
      queuePromotedParticipant: queuePromoted
    };
  }

  /**
   * Host master control: Clear the entire Lounge at once without touching Party members
   */
  public clearLounge(
    room: InternalRoom,
    hostSocketId: string
  ): { success: boolean; clearedParticipants: Participant[]; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, clearedParticipants: [], error: 'Only the host can clear the lounge.' };
    }

    const loungeMembers = this.getLoungeParticipants(room);
    const queuedMembers = Array.from(room.participants.values()).filter((p) => p.state === 'QUEUED');
    const cleared = [...loungeMembers, ...queuedMembers];

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

    target.microphoneState = 'MUTED';
    target.isSpeaking = false;
    target.isHostMuted = true;
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
      wasInLounge: wasInLounge || wasInQueue,
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

  public getRoomAndParticipantBySocketId(socketId: string): { room: InternalRoom; participant: Participant } | undefined {
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
          room.hostDisconnectGraceSeconds = 15;

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
          }, 15000);

          return {
            room,
            participant,
            isHostGracePeriod: true,
            graceSeconds: 15
          };
        } else {
          // Host is currently the sole occupant in the room:
          // DO NOT delete the host or destroy the room!
          // Keep participant and tokenToParticipant intact so host can reconnect or friends can join.
          room.disconnectedHostId = pId;
          this.touchRoom(room);
          return {
            room,
            participant,
            isHostGracePeriod: false
          };
        }
      }

      // If active party member disconnects unexpectedly, allow a 15-second reconnection window
      if (participant.state === 'PARTY') {
        return {
          room,
          participant,
          isHostGracePeriod: false
        };
      }

      const result = this.leaveRoom(room, socketId);
      return {
        room,
        participant: result.leavingParticipant,
        newHost: result.newHost,
        queuePromotedParticipant: result.queuePromotedParticipant
      };
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
    if (room.inactivityTimer) clearTimeout(room.inactivityTimer);
    if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);

    // Thorough memory wipe: room ceases to exist immediately
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

  public addChatMessage(room: InternalRoom, message: ChatMessage): void {
    room.chatHistory.push(message);
    if (room.chatHistory.length > 50) {
      room.chatHistory.shift();
    }
  }

  public updateMicrophoneState(
    room: InternalRoom,
    socketId: string,
    micState: MicrophoneState
  ): Participant | undefined {
    const participant = this.getParticipantBySocket(room, socketId);
    if (participant) {
      if (participant.isHostMuted && micState === 'ON') {
        return participant; // Block unmuting when locked by host
      }
      participant.microphoneState = micState;
      if (micState === 'MUTED' || micState === 'OFF' || micState === 'DENIED') {
        participant.isSpeaking = false;
      }
      return participant;
    }
    return undefined;
  }

  public updateSpeaking(
    room: InternalRoom,
    socketId: string,
    isSpeaking: boolean
  ): Participant | undefined {
    const participant = this.getParticipantBySocket(room, socketId);
    if (participant && participant.state === 'PARTY') {
      if (participant.microphoneState === 'MUTED' || participant.microphoneState === 'OFF') {
        participant.isSpeaking = false;
      } else {
        participant.isSpeaking = isSpeaking;
      }
      return participant;
    }
    return undefined;
  }

  private promoteNextQueuedUser(room: InternalRoom): Participant | undefined {
    if (room.queue.length === 0) return undefined;
    const nextId = room.queue.shift()!;
    const nextParticipant = room.participants.get(nextId);
    if (nextParticipant && nextParticipant.state === 'QUEUED') {
      nextParticipant.state = 'LOUNGE';
      nextParticipant.queuePosition = undefined;
      this.recalculateQueuePositions(room);
      return nextParticipant;
    }
    return undefined;
  }

  private recalculateQueuePositions(room: InternalRoom): void {
    room.queue.forEach((pId, idx) => {
      const p = room.participants.get(pId);
      if (p) {
        p.queuePosition = idx + 1;
      }
    });
  }

  private removeParticipantInternal(room: InternalRoom, participantId: string): void {
    const p = room.participants.get(participantId);
    if (p) {
      room.socketToParticipant.delete(p.socketId);
      room.tokenToParticipant.delete(p.sessionToken);
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
      room.inactivityTimer = undefined;
    }

    if (room.participants.size === 0) {
      room.inactivityTimer = setTimeout(() => {
        if (room.participants.size === 0) {
          this.rooms.delete(room.roomId);
        }
      }, INACTIVITY_TIMEOUT_MS);
    }
  }

  public getPartyParticipants(room: InternalRoom): Participant[] {
    const party = Array.from(room.participants.values()).filter((p) => p.state === 'PARTY');
    if (room.partyOrder && room.partyOrder.length > 0) {
      const orderMap = new Map(room.partyOrder.map((id, index) => [id, index]));
      return party.sort((a, b) => {
        const orderA = orderMap.has(a.participantId) ? orderMap.get(a.participantId)! : 999;
        const orderB = orderMap.has(b.participantId) ? orderMap.get(b.participantId)! : 999;
        return orderA - orderB;
      });
    }
    return party;
  }

  public reorderParty(
    room: InternalRoom,
    hostSocketId: string,
    orderedParticipantIds: string[]
  ): { success: boolean; error?: string } {
    const host = this.getParticipantBySocket(room, hostSocketId);
    if (!host || host.role !== 'HOST') {
      return { success: false, error: 'Only the host can rearrange party participants.' };
    }

    const currentPartyIds = new Set(
      Array.from(room.participants.values())
        .filter((p) => p.state === 'PARTY')
        .map((p) => p.participantId)
    );
    const newOrder = orderedParticipantIds.filter((id) => currentPartyIds.has(id));
    currentPartyIds.forEach((id) => {
      if (!newOrder.includes(id)) {
        newOrder.push(id);
      }
    });

    room.partyOrder = newOrder;
    this.touchRoom(room);
    return { success: true };
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

  public getClientRoomState(room: InternalRoom, currentUser: Participant): ClientRoomState {
    const party = this.getPartyParticipants(room);
    const lounge = this.getLoungeParticipants(room);
    return {
      room: this.getRoomSummary(room),
      currentUser,
      party,
      lounge,
      chatHistory: room.chatHistory,
      queuePosition: currentUser.queuePosition
    };
  }
}

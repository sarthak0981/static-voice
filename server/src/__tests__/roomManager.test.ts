import { describe, it, expect, beforeEach } from 'vitest';
import { RoomManager, PARTY_CAPACITY, LOUNGE_CAPACITY } from '../roomManager.js';

describe('RoomManager: Clear Lounge, Stop Invitations, Duplicate Names & Validation', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager();
  });

  it('disambiguates duplicate usernames in the same room', () => {
    const { room } = rm.createRoom('socket_host', 'Game Hub', 'Alex');

    const g1 = rm.joinRoom(room.roomId, 'sock_g1', 'Alex');
    expect(g1.success).toBe(true);
    expect(g1.participant?.displayName).toBe('Alex #2');

    const g2 = rm.joinRoom(room.roomId, 'sock_g2', 'Alex');
    expect(g2.success).toBe(true);
    expect(g2.participant?.displayName).toBe('Alex #3');
  });

  it('rejects invalid usernames (blank, spaces only, or unsupported chars)', () => {
    expect(() => rm.createRoom('socket_host', 'Party', '   ')).toThrow();

    const { room } = rm.createRoom('socket_host', 'Party', 'ValidHost');
    const joinBlank = rm.joinRoom(room.roomId, 'sock_1', '   ');
    expect(joinBlank.success).toBe(false);
    expect(joinBlank.errorCode).toBe('INVALID_INPUT');

    const joinTooLong = rm.joinRoom(room.roomId, 'sock_2', 'ThisNameIsWayTooLongForStaticVoiceApp');
    expect(joinTooLong.success).toBe(false);
    expect(joinTooLong.errorCode).toBe('INVALID_INPUT');
  });

  it('stops invitations with exact message "The invitations are closed 😊"', () => {
    const { room } = rm.createRoom('socket_host', 'Private Party', 'Host');
    rm.toggleInvitations(room, 'socket_host', false);

    const joinRes = rm.joinRoom(room.roomId, 'sock_new', 'Stranger');
    expect(joinRes.success).toBe(false);
    expect(joinRes.errorCode).toBe('INVITATIONS_CLOSED');
    expect(joinRes.error).toBe('The invitations are closed 😊');

    // Reopen invitations
    rm.toggleInvitations(room, 'socket_host', true);
    const joinAllowed = rm.joinRoom(room.roomId, 'sock_new', 'Stranger');
    expect(joinAllowed.success).toBe(true);
  });

  it('allows host to clear the entire lounge at once without touching party members or host', () => {
    const { room } = rm.createRoom('socket_host', 'Party', 'Host');

    // Admit 2 party members
    const gP1 = rm.joinRoom(room.roomId, 'sock_p1', 'Party1');
    rm.admitToParty(room, 'socket_host', gP1.participant!.participantId);

    const gP2 = rm.joinRoom(room.roomId, 'sock_p2', 'Party2');
    rm.admitToParty(room, 'socket_host', gP2.participant!.participantId);

    // Add 3 lounge members
    rm.joinRoom(room.roomId, 'sock_l1', 'Lounge1');
    rm.joinRoom(room.roomId, 'sock_l2', 'Lounge2');
    rm.joinRoom(room.roomId, 'sock_l3', 'Lounge3');

    expect(rm.getLoungeParticipants(room).length).toBe(3);
    expect(rm.getPartyParticipants(room).length).toBe(3);

    // Host clears lounge
    const clearRes = rm.clearLounge(room, 'socket_host');
    expect(clearRes.success).toBe(true);
    expect(clearRes.clearedParticipants.length).toBe(3);

    // Lounge is now empty
    expect(rm.getLoungeParticipants(room).length).toBe(0);

    // Party is completely untouched!
    expect(rm.getPartyParticipants(room).length).toBe(3);
    expect(rm.getPartyParticipants(room).map((p) => p.displayName)).toContain('Host');
    expect(rm.getPartyParticipants(room).map((p) => p.displayName)).toContain('Party1');
    expect(rm.getPartyParticipants(room).map((p) => p.displayName)).toContain('Party2');
  });

  it('allows host to reorder party participants and reflects across getPartyParticipants', () => {
    const { room } = rm.createRoom('socket_host', 'Party', 'Host');
    const gP1 = rm.joinRoom(room.roomId, 'sock_p1', 'Alice');
    rm.admitToParty(room, 'socket_host', gP1.participant!.participantId);

    const gP2 = rm.joinRoom(room.roomId, 'sock_p2', 'Bob');
    rm.admitToParty(room, 'socket_host', gP2.participant!.participantId);

    const initialParty = rm.getPartyParticipants(room);
    const hostId = initialParty.find((p) => p.displayName === 'Host')!.participantId;
    const aliceId = initialParty.find((p) => p.displayName === 'Alice')!.participantId;
    const bobId = initialParty.find((p) => p.displayName === 'Bob')!.participantId;

    // Non-host attempt rejected
    const nonHostRes = rm.reorderParty(room, 'sock_p1', [bobId, aliceId, hostId]);
    expect(nonHostRes.success).toBe(false);

    // Host reorders: Bob first, then Alice, then Host
    const hostRes = rm.reorderParty(room, 'socket_host', [bobId, aliceId, hostId]);
    expect(hostRes.success).toBe(true);

    const reorderedParty = rm.getPartyParticipants(room);
    expect(reorderedParty[0].participantId).toBe(bobId);
    expect(reorderedParty[1].participantId).toBe(aliceId);
    expect(reorderedParty[2].participantId).toBe(hostId);
  });

  it('handles host lock-mute and host-only unmute correctly', () => {
    const { room } = rm.createRoom('socket_host', 'Party', 'Host');
    const gP1 = rm.joinRoom(room.roomId, 'sock_p1', 'Alice');
    rm.admitToParty(room, 'socket_host', gP1.participant!.participantId);

    const alice = rm.getParticipantBySocket(room, 'sock_p1')!;
    expect(alice.isHostMuted).toBeFalsy();

    // Host mutes Alice
    const muteRes = rm.muteParticipant(room, 'socket_host', alice.participantId);
    expect(muteRes.success).toBe(true);
    expect(alice.isHostMuted).toBe(true);
    expect(alice.microphoneState).toBe('MUTED');

    // Alice tries to unmute herself - blocked because isHostMuted is true
    const micAttempt = rm.updateMicrophoneState(room, 'sock_p1', 'ON');
    expect(micAttempt?.microphoneState).toBe('MUTED');
    expect(alice.microphoneState).toBe('MUTED');

    // Non-host attempts to unmute Alice - rejected
    const nonHostUnmute = rm.unmuteParticipant(room, 'sock_p1', alice.participantId);
    expect(nonHostUnmute.success).toBe(false);
    expect(alice.isHostMuted).toBe(true);

    // Host unmutes Alice
    const hostUnmute = rm.unmuteParticipant(room, 'socket_host', alice.participantId);
    expect(hostUnmute.success).toBe(true);
    expect(alice.isHostMuted).toBe(false);

    // Now Alice can turn her mic ON
    const unmutedMicAttempt = rm.updateMicrophoneState(room, 'sock_p1', 'ON');
    expect(unmutedMicAttempt).not.toBeNull();
    expect(unmutedMicAttempt?.microphoneState).toBe('ON');
  });

  it('toggles raise hand state correctly for participants', () => {
    const { room } = rm.createRoom('socket_host', 'Party', 'Host');
    const gP1 = rm.joinRoom(room.roomId, 'sock_p1', 'Alice');
    rm.admitToParty(room, 'socket_host', gP1.participant!.participantId);

    const alice = rm.getParticipantBySocket(room, 'sock_p1')!;
    expect(alice.isHandRaised).toBeFalsy();

    // Alice raises hand
    const raiseRes = rm.toggleRaiseHand(room, 'sock_p1');
    expect(raiseRes.success).toBe(true);
    expect(raiseRes.participant?.isHandRaised).toBe(true);
    expect(alice.isHandRaised).toBe(true);

    // Alice lowers hand
    const lowerRes = rm.toggleRaiseHand(room, 'sock_p1');
    expect(lowerRes.success).toBe(true);
    expect(lowerRes.participant?.isHandRaised).toBe(false);
    expect(alice.isHandRaised).toBe(false);
  });
});


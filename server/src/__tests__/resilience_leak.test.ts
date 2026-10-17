import { describe, it, expect, vi } from 'vitest';
import { RoomManager, hashSessionToken } from '../roomManager.js';

describe('WebRTC & Room Resilience / Zero Leak Verification', () => {
  it('cleans up all room timers, participants, and queues upon room end', () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom('socket_host_1', 'Test Room', 'Host');

    // Add guests
    rm.joinRoom(room.roomId, 'socket_guest_1', 'Guest 1');
    rm.joinRoom(room.roomId, 'socket_guest_2', 'Guest 2');

    expect(room.participants.size).toBe(3);

    // End room
    const cleanup = rm.endRoom(room, 'socket_host_1');
    expect(cleanup.success).toBe(true);

    // Verify room has no lingering inactivity or grace timers
    expect(room.inactivityTimer).toBeUndefined();
    expect(room.hostGraceTimer).toBeUndefined();

    // Verify room is removed from manager
    expect(rm.getRoom(room.roomId)).toBeUndefined();
    expect(room.participants.size).toBe(0);
  });

  it('guarantees host grace timer is cleared when host reconnects within grace window', () => {
    const rm = new RoomManager();
    const { room, participant: host } = rm.createRoom('socket_host_1', 'Grace Room', 'Host');
    // Add another member so room doesn't self-destruct immediately
    rm.joinRoom(room.roomId, 'socket_guest_1', 'Active Guest');

    // Host disconnects
    const onGraceExpired = vi.fn();
    const dcResult = rm.handleUnexpectedDisconnect(host.socketId, onGraceExpired);
    expect(dcResult.isHostGracePeriod).toBe(true);
    expect(room.hostGraceTimer).toBeDefined();

    // Host reconnects with session token
    const reconnect = rm.joinRoom(room.roomId, 'socket_host_new', '', host.sessionToken);
    expect(reconnect.success).toBe(true);
    expect(reconnect.hostReconnected).toBe(true);

    // Verify grace timer was explicitly canceled
    expect(room.hostGraceTimer).toBeUndefined();
    expect(onGraceExpired).not.toHaveBeenCalled();
  });

  it('cleans up participant mappings when kicked or leaving', () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom('socket_host_1', 'Kick Room', 'Host');
    const guest = rm.joinRoom(room.roomId, 'socket_guest_1', 'Bad Actor');

    expect(room.socketToParticipant.has('socket_guest_1')).toBe(true);
    const tokenHash = hashSessionToken(guest.participant!.sessionToken);
    expect(room.tokenToParticipant.has(tokenHash)).toBe(true);

    // Host kicks participant
    const kickRes = rm.kickParticipant(room, 'socket_host_1', guest.participant!.participantId);
    expect(kickRes.success).toBe(true);

    // Verify maps are cleaned up and state is marked REMOVED
    expect(guest.participant!.state).toBe('REMOVED');
    expect(room.socketToParticipant.has('socket_guest_1')).toBe(false);
    expect(room.tokenToParticipant.has(tokenHash)).toBe(false);
  });
});

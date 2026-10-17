import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TokenBucket, RateLimiterManager } from '../rateLimiter.js';
import { RoomMutex, RoomManager } from '../roomManager.js';
import * as schemas from '../schemas.js';

describe('Phase 3: Backend Hardening Test Suite', () => {
  describe('TokenBucket & Rate Limiter', () => {
    it('allows bursts up to capacity and refills over elapsed time', async () => {
      const bucket = new TokenBucket({ capacity: 3, refillPerSecond: 10 });
      expect(bucket.tryConsume(1)).toBe(true);
      expect(bucket.tryConsume(1)).toBe(true);
      expect(bucket.tryConsume(1)).toBe(true);
      // Depleted
      expect(bucket.tryConsume(1)).toBe(false);

      // Wait 150ms -> should refill at least 1 token (10/sec = 1 token / 100ms)
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(bucket.tryConsume(1)).toBe(true);
    });

    it('enforces IP lockout upon repeated failed room code attempts', () => {
      const limiter = new RateLimiterManager();
      const ip = '192.168.1.100';

      expect(limiter.isIpJoinLockedOut(ip).isLocked).toBe(false);

      // Record 4 failed attempts
      for (let i = 0; i < 4; i++) {
        limiter.recordFailedJoin(ip);
      }
      expect(limiter.isIpJoinLockedOut(ip).isLocked).toBe(false);

      // 5th failed attempt triggers lockout
      limiter.recordFailedJoin(ip);
      const lockedState = limiter.isIpJoinLockedOut(ip);
      expect(lockedState.isLocked).toBe(true);
      expect(lockedState.remainingSeconds).toBeGreaterThan(0);

      // Successful join resets failed join tracking
      limiter.recordSuccessfulJoin(ip);
      expect(limiter.isIpJoinLockedOut(ip).isLocked).toBe(false);

      limiter.destroy();
    });

    it('tracks active rooms per IP and limits room creation', () => {
      const limiter = new RateLimiterManager();
      const ip = '10.0.0.5';

      expect(limiter.canIpCreateRoom(ip, 2)).toBe(true);
      limiter.registerRoomCreated(ip, 'ROOM1');
      expect(limiter.canIpCreateRoom(ip, 2)).toBe(true);
      limiter.registerRoomCreated(ip, 'ROOM2');
      expect(limiter.canIpCreateRoom(ip, 2)).toBe(false);

      limiter.unregisterRoom(ip, 'ROOM1');
      expect(limiter.canIpCreateRoom(ip, 2)).toBe(true);

      limiter.destroy();
    });
  });

  describe('Zod Schemas & Validation', () => {
    it('validates correct create-room payload and rejects malformed payloads', () => {
      const valid = schemas.validateEventPayload(schemas.createRoomSchema, {
        roomName: 'My Awesome Party',
        displayName: 'Alice'
      });
      expect(valid).not.toBeNull();
      expect(valid?.displayName).toBe('Alice');

      let cbError: any;
      const invalid = schemas.validateEventPayload(
        schemas.createRoomSchema,
        { displayName: '' },
        (res) => {
          cbError = res;
        }
      );
      expect(invalid).toBeNull();
      expect(cbError?.success).toBe(false);
      expect(cbError?.errorCode).toBe('INVALID_INPUT');
    });

    it('validates WebRTC signal payloads and rejects oversized SDP or malformed signals', () => {
      const validOffer = schemas.validateEventPayload(schemas.signalPeerSchema, {
        targetSocketId: 'sock_peer_1',
        type: 'offer',
        signal: { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\n' }
      });
      expect(validOffer).not.toBeNull();

      // Malformed signal (missing sdp on offer)
      const invalidOffer = schemas.validateEventPayload(schemas.signalPeerSchema, {
        targetSocketId: 'sock_peer_1',
        type: 'offer',
        signal: { type: 'offer' }
      });
      expect(invalidOffer).toBeNull();

      // Huge SDP exceeding limit
      const hugeSdp = 'a'.repeat(35000);
      const oversizedOffer = schemas.validateEventPayload(schemas.signalPeerSchema, {
        targetSocketId: 'sock_peer_1',
        type: 'offer',
        signal: { type: 'offer', sdp: hugeSdp }
      });
      expect(oversizedOffer).toBeNull();
    });
  });

  describe('RoomMutex & Concurrency', () => {
    it('executes concurrent asynchronous operations sequentially without interleaving', async () => {
      const mutex = new RoomMutex();
      const executionOrder: number[] = [];

      const p1 = mutex.runExclusive(async () => {
        await new Promise((r) => setTimeout(r, 25));
        executionOrder.push(1);
      });

      const p2 = mutex.runExclusive(async () => {
        await new Promise((r) => setTimeout(r, 5));
        executionOrder.push(2);
      });

      const p3 = mutex.runExclusive(async () => {
        executionOrder.push(3);
      });

      await Promise.all([p1, p2, p3]);
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('Session Superseding & Token Rotation', () => {
    it('rotates session token on reconnect and identifies superseded socket', () => {
      const rm = new RoomManager();
      const { room, participant } = rm.createRoom('socket_original', 'Session Room', 'Alice');
      const initialToken = participant.sessionToken;

      // Reconnect with new socket
      const reconnectResult = rm.joinRoom(room.roomId, 'socket_new', '', initialToken);
      expect(reconnectResult.success).toBe(true);
      expect(reconnectResult.supersededSocketId).toBe('socket_original');

      // Verify token rotated: new session token should differ from initial token
      expect(reconnectResult.participant?.sessionToken).not.toBe(initialToken);
      expect(participant.socketId).toBe('socket_new');

      rm.destroy();
    });
  });
});

import { Server, Socket } from 'socket.io';
import { RoomManager, InternalRoom } from './roomManager.js';
import { ClientToServerEvents, ServerToClientEvents } from './types.js';
import { rateLimiter } from './rateLimiter.js';
import { signalingMessagesCounter, signalingRejectedCounter } from './metrics.js';
import { logger } from './logger.js';

export function setupWebRTCSignaling(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager
) {
  return {
    handleSignal: (
      socket: Socket<ClientToServerEvents, ServerToClientEvents>,
      room: InternalRoom,
      payload: {
        targetSocketId: string;
        targetParticipantId?: string;
        signal: any;
        type: 'offer' | 'answer' | 'ice-candidate';
      },
      callback?: (res: { success: boolean; error?: string }) => void
    ) => {
      const cb = typeof callback === 'function' ? callback : () => {};

      // 1. Per-socket token bucket rate limiting on signaling bursts
      if (!rateLimiter.checkRateLimit(socket.id, 'signal-peer')) {
        signalingRejectedCounter.inc({ reason: 'rate_limited' });
        logger.warn(
          { socketId: socket.id, roomId: room.roomId, type: payload.type },
          'WebRTC signal rejected: rate limit exceeded'
        );
        return cb({ success: false, error: 'Signaling rate limit exceeded. Please slow down.' });
      }

      // 2. Sender PARTY gate
      const sender = roomManager.getParticipantBySocket(room, socket.id);
      if (!sender || sender.state !== 'PARTY') {
        signalingRejectedCounter.inc({ reason: 'sender_not_party' });
        logger.warn(
          { socketId: socket.id, roomId: room.roomId, state: sender?.state },
          'WebRTC signal rejected: sender is not in PARTY'
        );
        return cb({ success: false, error: 'Only Party members can exchange WebRTC signals.' });
      }

      // 3. Target PARTY gate
      let target = roomManager.getParticipantBySocket(room, payload.targetSocketId);
      if (!target && payload.targetParticipantId) {
        target = room.participants.get(payload.targetParticipantId);
      }

      if (!target || target.state !== 'PARTY') {
        signalingRejectedCounter.inc({ reason: 'target_not_party' });
        logger.warn(
          {
            senderId: sender.participantId,
            targetSocketId: payload.targetSocketId,
            roomId: room.roomId
          },
          'WebRTC signal rejected: target is not in PARTY'
        );
        return cb({ success: false, error: 'Target peer is not in Party.' });
      }

      // 4. Metrics & relay
      signalingMessagesCounter.inc({ type: payload.type });

      // Forward signal to target peer socket strictly within this room
      io.to(target.socketId).emit('signal-received', {
        targetSocketId: target.socketId,
        senderSocketId: socket.id,
        senderParticipantId: sender.participantId,
        roomId: room.roomId,
        signal: payload.signal,
        type: payload.type
      });

      cb({ success: true });
    }
  };
}

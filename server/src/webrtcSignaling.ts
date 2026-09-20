import { Server, Socket } from 'socket.io';
import { RoomManager, InternalRoom } from './roomManager.js';
import { ClientToServerEvents, ServerToClientEvents } from './types.js';

export function setupWebRTCSignaling(
  io: Server<ClientToServerEvents, ServerToClientEvents>,
  roomManager: RoomManager
) {
  // Signaling handler is attached to socket connections
  return {
    handleSignal: (
      socket: Socket<ClientToServerEvents, ServerToClientEvents>,
      room: InternalRoom,
      payload: { targetSocketId: string; signal: any; type: 'offer' | 'answer' | 'ice-candidate' }
    ) => {
      const sender = roomManager.getParticipantBySocket(room, socket.id);
      if (!sender || sender.state !== 'PARTY') {
        return; // Only Party members can exchange WebRTC signals
      }

      const target = roomManager.getParticipantBySocket(room, payload.targetSocketId);
      if (!target || target.state !== 'PARTY') {
        return; // Target must also be in Party
      }

      // Forward signal to target peer
      io.to(payload.targetSocketId).emit('signal-received', {
        targetSocketId: payload.targetSocketId,
        senderSocketId: socket.id,
        senderParticipantId: sender.participantId,
        signal: payload.signal,
        type: payload.type
      });
    }
  };
}

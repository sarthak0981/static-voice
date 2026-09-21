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
      payload: { targetSocketId: string; targetParticipantId?: string; signal: any; type: 'offer' | 'answer' | 'ice-candidate' }
    ) => {
      const sender = roomManager.getParticipantBySocket(room, socket.id);
      if (!sender || sender.state !== 'PARTY') {
        return; // Only Party members can exchange WebRTC signals
      }

      let target = roomManager.getParticipantBySocket(room, payload.targetSocketId);
      if (!target && payload.targetParticipantId) {
        target = room.participants.get(payload.targetParticipantId);
      }

      if (!target || target.state !== 'PARTY') {
        return; // Target must also be in Party
      }

      // Forward signal to target peer socket strictly within this room
      io.to(target.socketId).emit('signal-received', {
        targetSocketId: target.socketId,
        senderSocketId: socket.id,
        senderParticipantId: sender.participantId,
        roomId: room.roomId,
        signal: payload.signal,
        type: payload.type
      });
    }
  };
}

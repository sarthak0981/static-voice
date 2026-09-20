import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { io as Client, Socket } from 'socket.io-client';
import http from 'node:http';
import express from 'express';
import crypto from 'node:crypto';
import { Server as SocketIOServer } from 'socket.io';
import { RoomManager } from '../roomManager.js';
import { setupWebRTCSignaling } from '../webrtcSignaling.js';
import { ClientToServerEvents, ServerToClientEvents, ChatMessage } from '../types.js';

describe('STATIC Full Integration: Chat Sync, Clear Lounge, Stop Invitations & Host Transfer', () => {
  let server: http.Server;
  let io: SocketIOServer<ClientToServerEvents, ServerToClientEvents>;
  let roomManager: RoomManager;
  let port: number;
  let serverUrl: string;

  beforeAll(async () => {
    const app = express();
    server = http.createServer(app);
    io = new SocketIOServer(server, { cors: { origin: '*' } });
    roomManager = new RoomManager();
    const signaling = setupWebRTCSignaling(io, roomManager);

    function broadcastRoomState(roomId: string) {
      const room = roomManager.getRoom(roomId);
      if (!room) return;
      for (const participant of room.participants.values()) {
        const clientState = roomManager.getClientRoomState(room, participant);
        io.to(participant.socketId).emit('room-state-updated', clientState);
      }
    }

    io.on('connection', (socket) => {
      let currentRoomId: string | null = null;

      socket.on('create-room', ({ roomName, displayName, sessionToken }, callback) => {
        try {
          const { room, participant } = roomManager.createRoom(socket.id, roomName, displayName, sessionToken);
          currentRoomId = room.roomId;
          socket.join(room.roomId);
          callback({ success: true, roomId: room.roomId, sessionToken: participant.sessionToken });
          broadcastRoomState(room.roomId);
        } catch (err: any) {
          callback({ success: false, error: err.message });
        }
      });

      socket.on('join-room', ({ roomId, displayName, sessionToken }, callback) => {
        const result = roomManager.joinRoom(roomId, socket.id, displayName, sessionToken);
        if (!result.success || !result.participant || !result.room) {
          return callback({ success: false, error: result.error, errorCode: result.errorCode });
        }
        currentRoomId = result.room.roomId;
        socket.join(result.room.roomId);
        const clientState = roomManager.getClientRoomState(result.room, result.participant);
        callback({ success: true, state: clientState, sessionToken: result.participant.sessionToken });
        broadcastRoomState(result.room.roomId);
      });

      socket.on('admit-to-party', ({ targetParticipantId }, callback) => {
        if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return callback({ success: false, error: 'Room not found.' });

        const result = roomManager.admitToParty(room, socket.id, targetParticipantId);
        if (!result.success || !result.promotedParticipant) {
          return callback({ success: false, error: result.error });
        }

        io.to(result.promotedParticipant.socketId).emit('participant-admitted', result.promotedParticipant);
        callback({ success: true });
        broadcastRoomState(room.roomId);
      });

      socket.on('clear-lounge', (callback) => {
        if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return callback({ success: false, error: 'Room not found.' });

        const result = roomManager.clearLounge(room, socket.id);
        if (result.success) {
          for (const p of result.clearedParticipants) {
            io.to(p.socketId).emit('lounge-cleared', {
              reason: 'The host cleared the waiting lounge.'
            });
          }
        }
        callback({ success: result.success, clearedCount: result.clearedParticipants.length });
        broadcastRoomState(room.roomId);
      });

      socket.on('toggle-invitations', ({ open }, callback) => {
        if (!currentRoomId) return callback({ success: false });
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return callback({ success: false });

        const result = roomManager.toggleInvitations(room, socket.id, open);
        if (result.success) {
          io.to(room.roomId).emit('invitations-updated', { open: !!result.open });
        }
        callback({ success: result.success, open: result.open });
        broadcastRoomState(room.roomId);
      });

      socket.on('transfer-host', ({ targetParticipantId }, callback) => {
        if (!currentRoomId) return callback({ success: false });
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return callback({ success: false });

        const result = roomManager.transferHost(room, socket.id, targetParticipantId);
        if (result.success && result.newHost) {
          io.to(room.roomId).emit('host-changed', {
            newHostId: result.newHost.participantId,
            message: `${result.newHost.displayName} is now the host.`
          });
        }
        callback({ success: result.success });
        broadcastRoomState(room.roomId);
      });

      socket.on('send-party-chat', ({ text }, callback) => {
        if (!currentRoomId) return callback({ success: false });
        const room = roomManager.getRoom(currentRoomId);
        if (!room) return callback({ success: false });

        const sender = roomManager.getParticipantBySocket(room, socket.id);
        if (!sender || sender.state !== 'PARTY') return callback({ success: false });

        const chatMsg: ChatMessage = {
          id: 'm_' + crypto.randomBytes(4).toString('hex'),
          senderParticipantId: sender.participantId,
          senderName: sender.displayName,
          text,
          timestamp: Date.now(),
          isHost: sender.role === 'HOST'
        };

        roomManager.addChatMessage(room, chatMsg);
        io.to(room.roomId).emit('party-chat-message', chatMsg);
        callback({ success: true, message: chatMsg });
      });

      socket.on('leave-room', (options, callback) => {
        if (currentRoomId) {
          const room = roomManager.getRoom(currentRoomId);
          if (room) {
            const result = roomManager.leaveRoom(room, socket.id, options);
            socket.leave(room.roomId);
            if (result.newHost) {
              io.to(room.roomId).emit('host-changed', {
                newHostId: result.newHost.participantId,
                message: `${result.newHost.displayName} is now the host.`
              });
            }
            broadcastRoomState(room.roomId);
          }
          currentRoomId = null;
        }
        if (callback) callback({ success: true });
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address();
        if (typeof address === 'object' && address) {
          port = address.port;
          serverUrl = `http://localhost:${port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    io.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function createClient(): Promise<Socket<ServerToClientEvents, ClientToServerEvents>> {
    return new Promise((resolve) => {
      const client = Client(serverUrl, {
        transports: ['websocket'],
        forceNew: true
      });
      client.on('connect', () => resolve(client));
    });
  }

  it('verifies synchronized chat, clear lounge, stop invitations, and host transfer notification', async () => {
    const hostSocket = await createClient();
    const guestPartySocket = await createClient();
    const guestLoungeSocket = await createClient();

    // 1. Host creates room
    const createRes = await new Promise<any>((resolve) => {
      hostSocket.emit('create-room', { roomName: 'Test Sync Hub', displayName: 'HostAlpha' }, resolve);
    });
    expect(createRes.success).toBe(true);
    const roomId = createRes.roomId;

    // 2. Guest 1 joins and is admitted to Party
    const join1 = await new Promise<any>((resolve) => {
      guestPartySocket.emit('join-room', { roomId, displayName: 'PartyBeta' }, resolve);
    });
    expect(join1.success).toBe(true);
    const guestPartyId = join1.state.currentUser.participantId;

    await new Promise<any>((resolve) => {
      hostSocket.emit('admit-to-party', { targetParticipantId: guestPartyId }, resolve);
    });

    // 3. Guest 2 joins and remains in Lounge
    const join2 = await new Promise<any>((resolve) => {
      guestLoungeSocket.emit('join-room', { roomId, displayName: 'LoungeGamma' }, resolve);
    });
    expect(join2.success).toBe(true);

    // 4. Test Chat Synchronization: GuestParty sends message, HostAlpha receives it
    const hostChatPromise = new Promise<ChatMessage>((resolve) => {
      hostSocket.on('party-chat-message', resolve);
    });

    const sendRes = await new Promise<any>((resolve) => {
      guestPartySocket.emit('send-party-chat', { text: 'Hey host! Can you see this sync?' }, resolve);
    });
    expect(sendRes.success).toBe(true);

    const receivedChat = await hostChatPromise;
    expect(receivedChat.text).toBe('Hey host! Can you see this sync?');
    expect(receivedChat.senderName).toBe('PartyBeta');

    // 5. Test Host Clear Lounge
    const loungeClearedPromise = new Promise<any>((resolve) => {
      guestLoungeSocket.on('lounge-cleared', resolve);
    });

    const clearRes = await new Promise<any>((resolve) => {
      hostSocket.emit('clear-lounge', resolve);
    });
    expect(clearRes.success).toBe(true);
    expect(clearRes.clearedCount).toBe(1);

    const clearedNotice = await loungeClearedPromise;
    expect(clearedNotice.reason).toBe('The host cleared the waiting lounge.');

    // 6. Test Stop Invitations: exact message "The invitations are closed 😊"
    await new Promise<any>((resolve) => {
      hostSocket.emit('toggle-invitations', { open: false }, resolve);
    });

    const outsiderSocket = await createClient();
    const blockedJoin = await new Promise<any>((resolve) => {
      outsiderSocket.emit('join-room', { roomId, displayName: 'NewOutsider' }, resolve);
    });
    expect(blockedJoin.success).toBe(false);
    expect(blockedJoin.errorCode).toBe('INVITATIONS_CLOSED');
    expect(blockedJoin.error).toBe('The invitations are closed 😊');

    // 7. Test Host Transfer
    const hostChangedPromise = new Promise<any>((resolve) => {
      guestPartySocket.on('host-changed', resolve);
    });

    await new Promise<any>((resolve) => {
      hostSocket.emit('transfer-host', { targetParticipantId: guestPartyId }, resolve);
    });

    const hostChanged = await hostChangedPromise;
    expect(hostChanged.newHostId).toBe(guestPartyId);

    hostSocket.close();
    guestPartySocket.close();
    guestLoungeSocket.close();
    outsiderSocket.close();
  });
});

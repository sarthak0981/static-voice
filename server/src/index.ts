import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'node:crypto';
import { RoomManager } from './roomManager.js';
import { setupWebRTCSignaling } from './webrtcSignaling.js';
import { ClientToServerEvents, ServerToClientEvents, ChatMessage } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const roomManager = new RoomManager();
const signaling = setupWebRTCSignaling(io, roomManager);

function broadcastRoomState(roomId: string) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  for (const participant of room.participants.values()) {
    const clientState = roomManager.getClientRoomState(room, participant);
    io.to(participant.socketId).emit('room-state-updated', clientState);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'STATIC Voice Engine' });
});

app.get('/api/room/:roomId', (req, res) => {
  const room = roomManager.getRoom(req.params.roomId);
  if (!room) {
    return res.status(404).json({ exists: false, error: "We couldn't find that room." });
  }
  return res.json({
    exists: true,
    invitationsOpen: room.invitationsOpen,
    summary: roomManager.getRoomSummary(room)
  });
});

function getIceServersConfig(): Array<{ urls: string | string[]; username?: string; credential?: string }> {
  const defaultStun = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' }
  ];

  const turnUrls = process.env.TURN_URLS ? process.env.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean) : null;
  const turnUsername = process.env.TURN_USERNAME;
  const turnCredential = process.env.TURN_CREDENTIAL || process.env.TURN_PASSWORD;

  if (turnUrls && turnUrls.length > 0 && turnUsername && turnCredential) {
    return [
      ...defaultStun,
      {
        urls: turnUrls,
        username: turnUsername,
        credential: turnCredential
      }
    ];
  }

  // Fallback public relay for development/carrier NAT testing if no custom TURN env is set
  return [
    ...defaultStun,
    {
      urls: [
        'turn:openrelay.metered.ca:80',
        'turn:openrelay.metered.ca:443',
        'turn:openrelay.metered.ca:443?transport=tcp',
        'turns:openrelay.metered.ca:443?transport=tcp'
      ],
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ];
}

app.get('/api/ice-config', (_req, res) => {
  res.json({ iceServers: getIceServersConfig() });
});

const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));

app.get('*', (_req, res) => {
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('STATIC Server is running. Client build not found in dist.');
    }
  });
});

io.on('connection', (socket) => {
  let currentRoomId: string | null = null;

  socket.on('get-ice-config', (callback) => {
    if (typeof callback === 'function') {
      callback({ iceServers: getIceServersConfig() });
    }
  });

  // 1. Create Room (with custom roomName and sanitized displayName)
  socket.on('create-room', ({ roomName, displayName, sessionToken }, callback) => {
    try {
      const { room, participant } = roomManager.createRoom(
        socket.id,
        roomName,
        displayName,
        sessionToken
      );
      currentRoomId = room.roomId;
      socket.join(room.roomId);

      callback({
        success: true,
        roomId: room.roomId,
        sessionToken: participant.sessionToken
      });

      broadcastRoomState(room.roomId);
    } catch (err: any) {
      callback({ success: false, error: err.message || 'Failed to create room.' });
    }
  });

  // 2. Join Room (always requiring chosen displayName and valid code)
  socket.on('join-room', ({ roomId, displayName, sessionToken }, callback) => {
    try {
      const result = roomManager.joinRoom(roomId, socket.id, displayName, sessionToken);
      if (!result.success || !result.participant || !result.room) {
        return callback({
          success: false,
          error: result.error,
          errorCode: result.errorCode
        });
      }

      currentRoomId = result.room.roomId;
      socket.join(result.room.roomId);

      if (result.hostReconnected) {
        io.to(result.room.roomId).emit('host-reconnected', {
          hostId: result.participant.participantId,
          message: 'The host has reconnected.'
        });
      }

      const clientState = roomManager.getClientRoomState(result.room, result.participant);
      callback({
        success: true,
        state: clientState,
        sessionToken: result.participant.sessionToken
      });

      broadcastRoomState(result.room.roomId);
    } catch (err: any) {
      callback({ success: false, error: err.message || 'Failed to join room.' });
    }
  });

  // 3. Reconnect Session
  socket.on('reconnect-session', ({ roomId, sessionToken }, callback) => {
    try {
      const result = roomManager.joinRoom(roomId, socket.id, '', sessionToken);
      if (!result.success || !result.participant || !result.room) {
        return callback({ success: false, error: result.error });
      }

      currentRoomId = result.room.roomId;
      socket.join(result.room.roomId);

      if (result.hostReconnected) {
        io.to(result.room.roomId).emit('host-reconnected', {
          hostId: result.participant.participantId,
          message: 'The host has reconnected.'
        });
      }

      const clientState = roomManager.getClientRoomState(result.room, result.participant);
      callback({ success: true, state: clientState });
      broadcastRoomState(result.room.roomId);

      // If reconnected user is in the party, notify peers to establish WebRTC connections
      if (result.participant.state === 'PARTY') {
        const party = roomManager.getPartyParticipants(result.room);
        for (const member of party) {
          if (member.participantId !== result.participant.participantId) {
            io.to(member.socketId).emit('peer-ready-for-offer', {
              socketId: result.participant.socketId,
              participantId: result.participant.participantId
            });
          }
        }
      }
    } catch (err: any) {
      callback({ success: false, error: err.message || 'Failed to restore session.' });
    }
  });

  // 4. Host Admits User from Lounge into Party ("COME ON IN")
  socket.on('admit-to-party', ({ targetParticipantId }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.admitToParty(room, socket.id, targetParticipantId);
    if (!result.success || !result.promotedParticipant) {
      return callback({ success: false, error: result.error });
    }

    const admitted = result.promotedParticipant;
    io.to(admitted.socketId).emit('participant-admitted', admitted);

    // Notify all room members of the new party member
    io.to(room.roomId).emit('participant-joined-party', {
      participantId: admitted.participantId,
      displayName: admitted.displayName
    });

    const currentParty = roomManager.getPartyParticipants(room);
    for (const member of currentParty) {
      if (member.participantId !== admitted.participantId) {
        io.to(member.socketId).emit('peer-ready-for-offer', {
          socketId: admitted.socketId,
          participantId: admitted.participantId
        });
      }
    }

    callback({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 5. Host Master Control: Clear entire Lounge
  socket.on('clear-lounge', (callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.clearLounge(room, socket.id);
    if (!result.success) {
      return callback({ success: false, error: result.error });
    }

    // Inform every cleared lounge participant
    for (const p of result.clearedParticipants) {
      io.to(p.socketId).emit('lounge-cleared', {
        reason: 'The host cleared the waiting lounge.'
      });
    }

    callback({ success: true, clearedCount: result.clearedParticipants.length });
    broadcastRoomState(room.roomId);
  });

  // 6. Host Master Control: Mute participant
  socket.on('mute-participant', ({ targetParticipantId }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.muteParticipant(room, socket.id, targetParticipantId);
    if (!result.success || !result.mutedParticipant) {
      return callback({ success: false, error: result.error });
    }

    io.to(result.mutedParticipant.socketId).emit('force-muted', {
      reason: 'The host muted your microphone.'
    });

    callback({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 7. Host Master Control: Transfer host role
  socket.on('transfer-host', ({ targetParticipantId }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.transferHost(room, socket.id, targetParticipantId);
    if (!result.success || !result.newHost) {
      return callback({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('host-changed', {
      newHostId: result.newHost.participantId,
      message: `${result.newHost.displayName} is now the host.`
    });

    callback({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 8. Host Kicks Participant from Lounge/Queue
  socket.on('kick-participant', ({ targetParticipantId }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.kickParticipant(room, socket.id, targetParticipantId);
    if (!result.success || !result.kickedParticipant) {
      return callback({ success: false, error: result.error });
    }

    io.to(result.kickedParticipant.socketId).emit('kicked', {
      reason: 'You were removed from the room.'
    });

    socket.to(room.roomId).emit('participant-kicked', {
      participantId: result.kickedParticipant.participantId,
      displayName: result.kickedParticipant.displayName
    });

    callback({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 9. Host Removes Member from Party
  socket.on('remove-from-party', ({ targetParticipantId }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.removeFromParty(room, socket.id, targetParticipantId);
    if (!result.success || !result.removedParticipant) {
      return callback({ success: false, error: result.error });
    }

    io.to(result.removedParticipant.socketId).emit('removed-from-party', {
      reason: 'The host removed you from the Party.'
    });

    socket.to(room.roomId).emit('participant-kicked', {
      participantId: result.removedParticipant.participantId,
      displayName: result.removedParticipant.displayName
    });

    callback({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 10. Host Toggles Invitations (Stop / Reopen)
  socket.on('toggle-invitations', ({ open }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.toggleInvitations(room, socket.id, open);
    if (!result.success) {
      return callback({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('invitations-updated', { open: !!result.open });
    callback({ success: true, open: result.open });
    broadcastRoomState(room.roomId);
  });

  // 11. Host Ends Room ("END ROOM")
  socket.on('end-room', (callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.endRoom(room, socket.id);
    if (!result.success) {
      return callback({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('room-ended', { reason: 'The host closed the room. 👋' });
    io.in(room.roomId).socketsLeave(room.roomId);

    callback({ success: true });
  });

  // 12. Voluntary Leave Room (with manual or auto-transfer)
  socket.on('leave-room', (options, callback) => {
    if (currentRoomId) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        const result = roomManager.leaveRoom(room, socket.id, options);
        socket.leave(room.roomId);

        if (result.leavingParticipant) {
          socket.to(room.roomId).emit('participant-left-party', {
            participantId: result.leavingParticipant.participantId,
            displayName: result.leavingParticipant.displayName
          });
        }

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

  // 13. Party Text Chat (Broadcasted reliably to the entire room)
  socket.on('send-party-chat', ({ text }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const sender = roomManager.getParticipantBySocket(room, socket.id);
    if (!sender || sender.state !== 'PARTY') {
      return callback({ success: false, error: 'Only active party members can chat.' });
    }

    const cleanText = text?.trim();
    if (!cleanText || cleanText.length > 500) {
      return callback({ success: false, error: 'Invalid message length.' });
    }

    const chatMsg: ChatMessage = {
      id: 'm_' + crypto.randomBytes(4).toString('hex'),
      senderParticipantId: sender.participantId,
      senderName: sender.displayName,
      text: cleanText,
      timestamp: Date.now(),
      isHost: sender.role === 'HOST'
    };

    // Store in room chat history
    roomManager.addChatMessage(room, chatMsg);

    // Broadcast reliably to all sockets in this room!
    io.to(room.roomId).emit('party-chat-message', chatMsg);

    callback({ success: true, message: chatMsg });
  });

  // 14. Real-time Party Participant Reordering (Host Only)
  socket.on('reorder-party', ({ orderedParticipantIds }, callback) => {
    if (!currentRoomId) return callback({ success: false, error: 'Not in a room.' });
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return callback({ success: false, error: 'Room not found.' });

    const result = roomManager.reorderParty(room, socket.id, orderedParticipantIds);
    if (!result.success) {
      return callback({ success: false, error: result.error });
    }

    broadcastRoomState(room.roomId);
    callback({ success: true });
  });

  // 15. Update Microphone State
  socket.on('update-mic-state', ({ microphoneState }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    const updated = roomManager.updateMicrophoneState(room, socket.id, microphoneState);
    if (updated) {
      broadcastRoomState(room.roomId);
    }
  });

  // 15. Update Speaking Status
  socket.on('update-speaking', ({ isSpeaking }) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    const updated = roomManager.updateSpeaking(room, socket.id, isSpeaking);
    if (updated) {
      broadcastRoomState(room.roomId);
    }
  });

  // 16. WebRTC Peer Signaling
  socket.on('signal-peer', (payload) => {
    if (!currentRoomId) return;
    const room = roomManager.getRoom(currentRoomId);
    if (!room) return;

    signaling.handleSignal(socket, room, payload);
  });

  // 17. Socket Disconnect with 8-second grace period for Host
  socket.on('disconnect', () => {
    const result = roomManager.handleUnexpectedDisconnect(socket.id, (room, newHost) => {
      if (newHost) {
        io.to(room.roomId).emit('host-changed', {
          newHostId: newHost.participantId,
          message: `${newHost.displayName} is now running the room.`
        });
      }
      broadcastRoomState(room.roomId);
    });

    if (result.room) {
      if (result.isHostGracePeriod) {
        io.to(result.room.roomId).emit('host-disconnect-warning', {
          secondsRemaining: result.graceSeconds || 8,
          message: 'Host disconnected. Holding room for reconnection (8s)…'
        });
        broadcastRoomState(result.room.roomId);
      } else {
        if (result.participant) {
          socket.to(result.room.roomId).emit('participant-disconnected', {
            participantId: result.participant.participantId,
            displayName: result.participant.displayName
          });
        }
        if (result.newHost) {
          io.to(result.room.roomId).emit('host-changed', {
            newHostId: result.newHost.participantId,
            message: `${result.newHost.displayName} is now running the room.`
          });
        }
        broadcastRoomState(result.room.roomId);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`[STATIC] Real-time voice engine listening on http://localhost:${PORT}`);
});

export { app, server, roomManager, io };

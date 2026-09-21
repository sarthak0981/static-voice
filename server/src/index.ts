import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'node:crypto';
import { RoomManager, InternalRoom } from './roomManager.js';
import { setupWebRTCSignaling } from './webrtcSignaling.js';
import { ClientToServerEvents, ServerToClientEvents, ChatMessage, Participant } from './types.js';

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
app.use(express.static(clientDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));

app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('STATIC Server is running. Client build not found in dist.');
    }
  });
});

io.on('connection', (socket) => {
  let currentRoomId: string | null = null;

  const leaveAllCurrentRooms = () => {
    if (currentRoomId) {
      socket.leave(currentRoomId);
      currentRoomId = null;
    }
    for (const r of socket.rooms) {
      if (r !== socket.id) {
        socket.leave(r);
      }
    }
  };

  const resolveRoomAndParticipant = (explicitRoomId?: string): { room: InternalRoom; participant: Participant } | null => {
    if (explicitRoomId) {
      const room = roomManager.getRoom(explicitRoomId);
      if (room) {
        const participant = roomManager.getParticipantBySocket(room, socket.id);
        if (participant) {
          currentRoomId = room.roomId;
          return { room, participant };
        }
      }
    }

    if (currentRoomId) {
      const room = roomManager.getRoom(currentRoomId);
      if (room) {
        const participant = roomManager.getParticipantBySocket(room, socket.id);
        if (participant) {
          return { room, participant };
        }
      }
    }

    const found = roomManager.getRoomAndParticipantBySocketId(socket.id);
    if (found) {
      currentRoomId = found.room.roomId;
      socket.join(found.room.roomId);
      return found;
    }

    return null;
  };

  socket.on('get-ice-config', (callback) => {
    if (typeof callback === 'function') {
      callback({ iceServers: getIceServersConfig() });
    }
  });

  // 1. Create Room (with custom roomName and sanitized displayName)
  socket.on('create-room', ({ roomName, displayName, sessionToken }, callback) => {
    try {
      leaveAllCurrentRooms();

      const { room, participant } = roomManager.createRoom(
        socket.id,
        roomName,
        displayName,
        sessionToken
      );
      currentRoomId = room.roomId;
      socket.join(room.roomId);

      const clientState = roomManager.getClientRoomState(room, participant);

      callback({
        success: true,
        roomId: room.roomId,
        sessionToken: participant.sessionToken,
        state: clientState
      });

      broadcastRoomState(room.roomId);
    } catch (err: any) {
      callback({ success: false, error: err.message || 'Failed to create room.' });
    }
  });

  // 2. Join Room (always requiring chosen displayName and valid code)
  socket.on('join-room', ({ roomId, displayName, sessionToken }, callback) => {
    try {
      leaveAllCurrentRooms();

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
      leaveAllCurrentRooms();

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
  socket.on('admit-to-party', ({ targetParticipantId, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.admitToParty(room, socket.id, targetParticipantId);
    if (!result.success || !result.promotedParticipant) {
      return cb({ success: false, error: result.error });
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

    cb({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 5. Host Master Control: Clear entire Lounge
  socket.on('clear-lounge', (payloadOrCallback: any, callback?: any) => {
    const cb = typeof callback === 'function' ? callback : typeof payloadOrCallback === 'function' ? payloadOrCallback : () => {};
    const explicitRoomId = typeof payloadOrCallback === 'object' ? payloadOrCallback?.roomId : undefined;
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.clearLounge(room, socket.id);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    // Inform every cleared lounge participant
    for (const p of result.clearedParticipants) {
      io.to(p.socketId).emit('lounge-cleared', {
        reason: 'The host cleared the waiting lounge.'
      });
    }

    cb({ success: true, clearedCount: result.clearedParticipants.length });
    broadcastRoomState(room.roomId);
  });

  // 6. Host Master Control: Mute participant
  socket.on('mute-participant', ({ targetParticipantId, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.muteParticipant(room, socket.id, targetParticipantId);
    if (!result.success || !result.mutedParticipant) {
      return cb({ success: false, error: result.error });
    }

    io.to(result.mutedParticipant.socketId).emit('force-muted', {
      reason: 'The host muted your microphone.'
    });

    cb({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 6b. Host Master Control: Unmute participant
  socket.on('unmute-participant', ({ targetParticipantId, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.unmuteParticipant(room, socket.id, targetParticipantId);
    if (!result.success || !result.unmutedParticipant) {
      return cb({ success: false, error: result.error });
    }

    io.to(result.unmutedParticipant.socketId).emit('unmuted-by-host', {
      reason: 'The host unmuted your microphone. You can now speak.'
    });

    cb({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 6c. Party Participant: Toggle Raise Hand
  socket.on('toggle-raise-hand', (payloadOrCallback: any, callback?: any) => {
    const cb = typeof callback === 'function' ? callback : typeof payloadOrCallback === 'function' ? payloadOrCallback : () => {};
    const explicitRoomId = typeof payloadOrCallback === 'object' ? payloadOrCallback?.roomId : undefined;
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.toggleRaiseHand(room, socket.id);
    if (!result.success || !result.participant) {
      return cb({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('hand-raised', {
      participantId: result.participant.participantId,
      displayName: result.participant.displayName,
      isHandRaised: !!result.participant.isHandRaised
    });

    cb({ success: true, isHandRaised: !!result.participant.isHandRaised });
    broadcastRoomState(room.roomId);
  });

  // 7. Host Master Control: Transfer host role
  socket.on('transfer-host', ({ targetParticipantId, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.transferHost(room, socket.id, targetParticipantId);
    if (!result.success || !result.newHost) {
      return cb({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('host-changed', {
      newHostId: result.newHost.participantId,
      message: `${result.newHost.displayName} is now the host.`
    });

    cb({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 8. Host Kicks Participant from Lounge/Queue
  socket.on('kick-participant', ({ targetParticipantId, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.kickParticipant(room, socket.id, targetParticipantId);
    if (!result.success || !result.kickedParticipant) {
      return cb({ success: false, error: result.error });
    }

    const isLounge = !!result.wasInLounge;

    io.to(result.kickedParticipant.socketId).emit('kicked', {
      fromLounge: isLounge,
      reason: isLounge
        ? 'The host has denied your request to join the party.'
        : 'You were removed from the room by the host.'
    });

    socket.to(room.roomId).emit('participant-kicked', {
      participantId: result.kickedParticipant.participantId,
      displayName: result.kickedParticipant.displayName,
      fromLounge: isLounge
    });

    cb({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 9. Host Removes Member from Party
  socket.on('remove-from-party', ({ targetParticipantId, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.removeFromParty(room, socket.id, targetParticipantId);
    if (!result.success || !result.removedParticipant) {
      return cb({ success: false, error: result.error });
    }

    io.to(result.removedParticipant.socketId).emit('removed-from-party', {
      reason: 'The host removed you from the Party.'
    });

    socket.to(room.roomId).emit('participant-kicked', {
      participantId: result.removedParticipant.participantId,
      displayName: result.removedParticipant.displayName
    });

    cb({ success: true });
    broadcastRoomState(room.roomId);
  });

  // 10. Host Toggles Invitations (Stop / Reopen)
  socket.on('toggle-invitations', ({ open, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.toggleInvitations(room, socket.id, open);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('invitations-updated', { open: !!result.open });
    cb({ success: true, open: result.open });
    broadcastRoomState(room.roomId);
  });

  // 11. Host Ends Room ("END ROOM")
  socket.on('end-room', (payloadOrCallback?: any, callback?: any) => {
    const cb = typeof callback === 'function' ? callback : typeof payloadOrCallback === 'function' ? payloadOrCallback : () => {};
    const explicitRoomId = typeof payloadOrCallback === 'object' ? payloadOrCallback?.roomId : undefined;
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.endRoom(room, socket.id);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('room-ended', { reason: 'The host closed the room. 👋' });
    io.in(room.roomId).socketsLeave(room.roomId);
    currentRoomId = null;

    cb({ success: true });
  });

  // 12. Voluntary Leave Room (with manual or auto-transfer)
  socket.on('leave-room', (options: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : typeof options === 'function' ? options : () => {};
    const explicitRoomId = typeof options === 'object' ? options?.roomId : undefined;
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (resolved) {
      const { room } = resolved;
      const result = roomManager.leaveRoom(room, socket.id, options);
      socket.leave(room.roomId);

      if (result.leavingParticipant) {
        io.to(room.roomId).emit('participant-left-party', {
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
      currentRoomId = null;
    }
    cb({ success: true });
  });

  // 13. Party Text Chat (Broadcasted reliably to the entire room)
  socket.on('send-party-chat', ({ text, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room, participant: sender } = resolved;

    if (sender.state !== 'PARTY') {
      return cb({ success: false, error: 'Only active party members can chat.' });
    }

    const cleanText = text?.trim();
    if (!cleanText || cleanText.length > 500) {
      return cb({ success: false, error: 'Invalid message length.' });
    }

    const chatMsg: ChatMessage = {
      id: 'm_' + crypto.randomBytes(4).toString('hex'),
      roomId: room.roomId,
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

    cb({ success: true, message: chatMsg });
  });

  // 14. Real-time Party Participant Reordering (Host Only)
  socket.on('reorder-party', ({ orderedParticipantIds, roomId: explicitRoomId }: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.reorderParty(room, socket.id, orderedParticipantIds);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    broadcastRoomState(room.roomId);
    cb({ success: true });
  });

  // 15. Update Microphone State
  socket.on('update-mic-state', ({ microphoneState, roomId: explicitRoomId }: any) => {
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return;
    const { room } = resolved;

    const updated = roomManager.updateMicrophoneState(room, socket.id, microphoneState);
    if (updated) {
      broadcastRoomState(room.roomId);
    }
  });

  // 15. Update Speaking Status
  socket.on('update-speaking', ({ isSpeaking, roomId: explicitRoomId }: any) => {
    const resolved = resolveRoomAndParticipant(explicitRoomId);
    if (!resolved) return;
    const { room } = resolved;

    const updated = roomManager.updateSpeaking(room, socket.id, isSpeaking);
    if (updated) {
      broadcastRoomState(room.roomId);
    }
  });

  // 16. WebRTC Peer Signaling
  socket.on('signal-peer', (payload: any) => {
    const resolved = resolveRoomAndParticipant(payload?.roomId);
    if (!resolved) return;
    const { room } = resolved;

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
          io.to(result.room.roomId).emit('participant-disconnected', {
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

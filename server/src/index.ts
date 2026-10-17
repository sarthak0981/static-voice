import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Server } from 'socket.io';
import cors from 'cors';
import crypto from 'node:crypto';
import helmet from 'helmet';
import compression from 'compression';

import { config } from './config.js';
import { logger } from './logger.js';
import {
  register,
  activeRoomsGauge,
  participantsGauge,
  queueLengthGauge,
  reconnectsCounter,
  gracePeriodSavesCounter,
  iceConfigRequestsCounter
} from './metrics.js';
import { rateLimiter } from './rateLimiter.js';
import * as schemas from './schemas.js';
import { RoomManager, InternalRoom } from './roomManager.js';
import { setupWebRTCSignaling } from './webrtcSignaling.js';
import { ClientToServerEvents, ServerToClientEvents, ChatMessage, Participant } from './types.js';
import { evaluateTextSafety, strikeTracker } from './safety.js';
import { generateHmacTurnCredentials } from './turnCredentials.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = config.PORT;
const app = express();
const server = http.createServer(app);

// Configure trust proxy
if (config.TRUST_PROXY) {
  app.set('trust proxy', config.TRUST_PROXY);
}

// HTTP security headers & compression
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  })
);
app.use(compression());

// CORS configuration
const allowedOrigins =
  !config.CORS_ORIGIN || config.CORS_ORIGIN === '*'
    ? true
    : config.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);
app.use(express.json({ limit: '100kb' }));

// Keep-alive tuning for HTTP server
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// Socket.IO Server configuration
const io = new Server<ClientToServerEvents, ServerToClientEvents>(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  },
  transports: ['websocket'],
  perMessageDeflate: false,
  pingInterval: 10000,
  pingTimeout: 5000,
  maxHttpBufferSize: 100 * 1024,
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000,
    skipMiddlewares: true
  }
});

const roomManager = new RoomManager();
const signaling = setupWebRTCSignaling(io, roomManager);

// Helper for socket IP extraction
function getSocketIp(socket: any): string {
  const forwarded = socket.handshake.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return socket.handshake.address || socket.id;
}

function broadcastRoomState(roomId: string) {
  const room = roomManager.getRoom(roomId);
  if (!room) return;

  for (const participant of room.participants.values()) {
    const clientState = roomManager.getClientRoomState(room, participant);
    io.to(participant.socketId).emit('room-state-updated', clientState);
  }
}

// Periodic metrics synchronization
const metricsInterval = setInterval(() => {
  const rooms = Array.from(roomManager.getAllRooms());
  activeRoomsGauge.set(rooms.length);

  let party = 0;
  let lounge = 0;
  let queued = 0;
  let disconnected = 0;
  let totalQueue = 0;

  for (const r of rooms) {
    totalQueue += r.queue.length;
    for (const p of r.participants.values()) {
      if (p.state === 'PARTY') party++;
      else if (p.state === 'LOUNGE') lounge++;
      else if (p.state === 'QUEUED') queued++;
      else if (p.state === 'DISCONNECTED') disconnected++;
    }
  }

  participantsGauge.set({ state: 'PARTY' }, party);
  participantsGauge.set({ state: 'LOUNGE' }, lounge);
  participantsGauge.set({ state: 'QUEUED' }, queued);
  participantsGauge.set({ state: 'DISCONNECTED' }, disconnected);
  queueLengthGauge.set(totalQueue);
}, 10000);
metricsInterval.unref();

// Liveness & Readiness Probes
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'STATIC Voice Engine',
    uptime: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

app.get('/ready', (_req, res) => {
  res.json({
    status: 'ready',
    activeRooms: roomManager.getRoomCount(),
    uptime: Math.floor(process.uptime())
  });
});

// Prometheus metrics endpoint
app.get('/metrics', async (_req, res) => {
  try {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (err: any) {
    res.status(500).end(err.message);
  }
});

// Legacy health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'STATIC Voice Engine' });
});

// Room existence check
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

function getIceServersConfig(participantId?: string): Array<{ urls: string | string[]; username?: string; credential?: string }> {
  const defaultStun = config.STUN_SERVERS
    ? config.STUN_SERVERS.split(',').map((u) => ({ urls: u.trim() }))
    : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
      ];

  const turnSecret = config.TURN_SHARED_SECRET;
  const turnHost = (config.TURN_HOST || config.TURN_SERVER_URL || '')
    .replace(/^turns?:/i, '')
    .replace(/^\/\//, '')
    .split(':')[0]
    .trim();

  // 1. Production time-limited HMAC credentials (coturn use-auth-secret scheme)
  if (turnSecret && turnHost) {
    const creds = generateHmacTurnCredentials(turnSecret, participantId || 'guest', 7200);
    return [
      ...defaultStun,
      {
        urls: [`turn:${turnHost}:3478?transport=udp`],
        username: creds.username,
        credential: creds.credential
      },
      {
        urls: [`turn:${turnHost}:3478?transport=tcp`],
        username: creds.username,
        credential: creds.credential
      },
      {
        urls: [`turns:${turnHost}:443?transport=tcp`],
        username: creds.username,
        credential: creds.credential
      }
    ];
  }

  // 2. Documented legacy static TURN fallback
  const turnUrls = config.TURN_URLS ? config.TURN_URLS.split(',').map((u) => u.trim()).filter(Boolean) : null;
  const turnUsername = config.TURN_USERNAME;
  const turnCredential = config.TURN_CREDENTIAL || config.TURN_PASSWORD;

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

  // 3. Fallback public relay for development/carrier NAT testing if no custom TURN env is set
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

// Client static files
const clientDistPath = path.resolve(__dirname, '../../client/dist');
app.use(
  express.static(clientDistPath, {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    }
  })
);

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
  const socketIp = getSocketIp(socket);

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

  // ICE config negotiation with rate limiting
  socket.on('get-ice-config', (callback) => {
    if (typeof callback !== 'function') return;

    if (!rateLimiter.checkRateLimit(socket.id, 'get-ice-config')) {
      logger.warn({ socketId: socket.id }, 'get-ice-config rate limit exceeded');
      callback({ iceServers: getIceServersConfig() });
      return;
    }

    iceConfigRequestsCounter.inc();
    const current = resolveRoomAndParticipant();
    const pId = current?.participant?.participantId;
    callback({ iceServers: getIceServersConfig(pId) });
  });

  // 1. Create Room
  socket.on('create-room', (rawPayload, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};

    if (!rateLimiter.checkRateLimit(socketIp, 'create-room')) {
      return cb({
        success: false,
        errorCode: 'RATE_LIMITED',
        error: 'Too many rooms created. Please wait a moment.'
      });
    }

    if (!rateLimiter.canIpCreateRoom(socketIp, config.MAX_ROOMS_PER_IP)) {
      return cb({
        success: false,
        errorCode: 'ROOM_LIMIT_REACHED',
        error: 'Maximum active rooms per IP reached.'
      });
    }

    if (roomManager.getRoomCount() >= config.MAX_ROOMS_GLOBAL) {
      return cb({
        success: false,
        errorCode: 'GLOBAL_CAPACITY_REACHED',
        error: 'Server room capacity reached. Please try again soon.'
      });
    }

    const validated = schemas.validateEventPayload(schemas.createRoomSchema, rawPayload, cb);
    if (!validated) return;

    try {
      leaveAllCurrentRooms();

      const { room, participant } = roomManager.createRoom(
        socket.id,
        validated.roomName,
        validated.displayName,
        validated.sessionToken
      );

      rateLimiter.registerRoomCreated(socketIp, room.roomId);
      currentRoomId = room.roomId;
      socket.join(room.roomId);

      const clientState = roomManager.getClientRoomState(room, participant);

      cb({
        success: true,
        roomId: room.roomId,
        sessionToken: participant.sessionToken,
        state: clientState
      });

      broadcastRoomState(room.roomId);
    } catch (err: any) {
      cb({ success: false, error: err.message || 'Failed to create room.' });
    }
  });

  // 2. Join Room
  socket.on('join-room', (rawPayload, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};

    const lockout = rateLimiter.isIpJoinLockedOut(socketIp);
    if (lockout.isLocked) {
      return cb({
        success: false,
        errorCode: 'IP_LOCKED_OUT',
        error: `Too many failed join attempts. Please wait ${lockout.remainingSeconds}s.`
      });
    }

    if (!rateLimiter.checkRateLimit(socketIp, 'join-room')) {
      return cb({
        success: false,
        errorCode: 'RATE_LIMITED',
        error: 'Joining too fast. Please wait a moment.'
      });
    }

    const validated = schemas.validateEventPayload(schemas.joinRoomSchema, rawPayload, cb);
    if (!validated) return;

    try {
      leaveAllCurrentRooms();

      const result = roomManager.joinRoom(
        validated.roomId,
        socket.id,
        validated.displayName,
        validated.sessionToken
      );

      if (!result.success || !result.participant || !result.room) {
        if (result.errorCode === 'NOT_FOUND' || result.errorCode === 'INVALID_INPUT') {
          rateLimiter.recordFailedJoin(socketIp);
        }
        return cb({
          success: false,
          error: result.error,
          errorCode: result.errorCode
        });
      }

      rateLimiter.recordSuccessfulJoin(socketIp);

      if (result.supersededSocketId) {
        io.to(result.supersededSocketId).emit('session-replaced', {
          reason: 'Your session was opened in another window or device.'
        });
        io.sockets.sockets.get(result.supersededSocketId)?.disconnect(true);
      }

      currentRoomId = result.room.roomId;
      socket.join(result.room.roomId);

      if (result.hostReconnected) {
        gracePeriodSavesCounter.inc();
        io.to(result.room.roomId).emit('host-reconnected', {
          hostId: result.participant.participantId,
          message: 'The host has reconnected.'
        });
      }

      const clientState = roomManager.getClientRoomState(result.room, result.participant);
      cb({
        success: true,
        state: clientState,
        sessionToken: result.participant.sessionToken
      });

      broadcastRoomState(result.room.roomId);
    } catch (err: any) {
      cb({ success: false, error: err.message || 'Failed to join room.' });
    }
  });

  // 3. Reconnect Session
  socket.on('reconnect-session', (rawPayload, callback) => {
    const cb = typeof callback === 'function' ? callback : () => {};

    if (!rateLimiter.checkRateLimit(socketIp, 'reconnect-session')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Reconnecting too fast.' });
    }

    const validated = schemas.validateEventPayload(schemas.reconnectSessionSchema, rawPayload, cb);
    if (!validated) return;

    try {
      leaveAllCurrentRooms();

      const result = roomManager.joinRoom(validated.roomId, socket.id, '', validated.sessionToken);
      if (!result.success || !result.participant || !result.room) {
        reconnectsCounter.inc({ status: 'failed' });
        return cb({ success: false, error: result.error });
      }

      reconnectsCounter.inc({ status: 'success' });

      if (result.supersededSocketId) {
        io.to(result.supersededSocketId).emit('session-replaced', {
          reason: 'Your session was opened in another window or device.'
        });
        io.sockets.sockets.get(result.supersededSocketId)?.disconnect(true);
      }

      currentRoomId = result.room.roomId;
      socket.join(result.room.roomId);

      if (result.hostReconnected) {
        gracePeriodSavesCounter.inc();
        io.to(result.room.roomId).emit('host-reconnected', {
          hostId: result.participant.participantId,
          message: 'The host has reconnected.'
        });
      }

      const clientState = roomManager.getClientRoomState(result.room, result.participant);
      cb({ success: true, state: clientState });
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
      cb({ success: false, error: err.message || 'Failed to restore session.' });
    }
  });

  // 4. Host Admits User from Lounge into Party
  socket.on('admit-to-party', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.participantTargetSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.admitToParty(room, socket.id, validated.targetParticipantId);
    if (!result.success || !result.admittedParticipant) {
      return cb({ success: false, error: result.error });
    }

    const admitted = result.admittedParticipant;
    io.to(admitted.socketId).emit('participant-admitted', admitted);

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
  socket.on('clear-lounge', (rawPayload: any, callback?: any) => {
    const cb = typeof callback === 'function' ? callback : typeof rawPayload === 'function' ? rawPayload : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.clearLoungeSchema, typeof rawPayload === 'object' ? rawPayload : {}, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.clearLounge(room, socket.id);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    for (const p of result.clearedParticipants) {
      io.to(p.socketId).emit('lounge-cleared', {
        reason: 'The host cleared the waiting lounge.'
      });
    }

    cb({ success: true, clearedCount: result.clearedParticipants.length });
    broadcastRoomState(room.roomId);
  });

  // 6. Host Master Control: Mute participant
  socket.on('mute-participant', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.participantTargetSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.muteParticipant(room, socket.id, validated.targetParticipantId);
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
  socket.on('unmute-participant', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.participantTargetSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.unmuteParticipant(room, socket.id, validated.targetParticipantId);
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
  socket.on('toggle-raise-hand', (rawPayload: any, callback?: any) => {
    const cb = typeof callback === 'function' ? callback : typeof rawPayload === 'function' ? rawPayload : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'toggle-raise-hand')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Please wait before toggling hand raise.' });
    }

    const validated = schemas.validateEventPayload(schemas.toggleRaiseHandSchema, typeof rawPayload === 'object' ? rawPayload : {}, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
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
  socket.on('transfer-host', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.participantTargetSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.transferHost(room, socket.id, validated.targetParticipantId);
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
  socket.on('kick-participant', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.participantTargetSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.kickParticipant(room, socket.id, validated.targetParticipantId);
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
  socket.on('remove-from-party', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.participantTargetSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.removeFromParty(room, socket.id, validated.targetParticipantId);
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
  socket.on('toggle-invitations', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.toggleInvitationsSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.toggleInvitations(room, socket.id, validated.open);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    io.to(room.roomId).emit('invitations-updated', { open: !!result.open });
    cb({ success: true, open: result.open });
    broadcastRoomState(room.roomId);
  });

  // 11. Host Ends Room ("END ROOM")
  socket.on('end-room', (rawPayload?: any, callback?: any) => {
    const cb = typeof callback === 'function' ? callback : typeof rawPayload === 'function' ? rawPayload : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.endRoomSchema, typeof rawPayload === 'object' ? rawPayload : {}, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.endRoom(room, socket.id);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    rateLimiter.unregisterRoom(socketIp, room.roomId);
    io.to(room.roomId).emit('room-ended', { reason: 'The host closed the room. 👋' });
    io.in(room.roomId).socketsLeave(room.roomId);
    currentRoomId = null;

    cb({ success: true });
  });

  // 12. Voluntary Leave Room (with manual or auto-transfer)
  socket.on('leave-room', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : typeof rawPayload === 'function' ? rawPayload : () => {};
    const validated = schemas.validateEventPayload(schemas.leaveRoomSchema, typeof rawPayload === 'object' ? rawPayload : {}, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (resolved) {
      const { room } = resolved;
      const result = roomManager.leaveRoom(room, socket.id, validated);
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

  // 13. Party Text Chat
  socket.on('send-party-chat', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'send-party-chat')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Chatting too fast. Please slow down.' });
    }

    const validated = schemas.validateEventPayload(schemas.sendPartyChatSchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room, participant: sender } = resolved;

    if (sender.state !== 'PARTY') {
      return cb({ success: false, error: 'Only active party members can chat.' });
    }

    if (strikeTracker.isParticipantChatMuted(sender.participantId)) {
      return cb({ success: false, error: 'Your chat is muted due to safety violations.' });
    }

    const cleanText = validated.text;
    const safety = evaluateTextSafety(cleanText, 'chat');
    if (!safety.isSafe) {
      const strike = strikeTracker.recordViolation(sender.participantId);
      if (strike.action === 'NOTIFY_HOST') {
        const host = room.participants.get(room.hostId);
        if (host) {
          io.to(host.socketId).emit('party-chat-message', {
            id: 'mod_' + crypto.randomBytes(4).toString('hex'),
            roomId: room.roomId,
            senderParticipantId: 'system',
            senderName: 'STATIC Safety',
            text: `[Moderation Alert]: ${sender.displayName} has accumulated multiple safety violations.`,
            timestamp: Date.now(),
            isHost: false
          });
        }
      }
      return cb({
        success: false,
        error: `${safety.policyViolation || 'Message violates Community Safety Guidelines.'} (${strike.message})`
      });
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

    roomManager.addChatMessage(room, chatMsg);
    io.to(room.roomId).emit('party-chat-message', chatMsg);

    cb({ success: true, message: chatMsg });
  });

  // 14. Real-time Party Participant Reordering (Host Only)
  socket.on('reorder-party', (rawPayload: any, callback: any) => {
    const cb = typeof callback === 'function' ? callback : () => {};
    if (!rateLimiter.checkRateLimit(socket.id, 'host-action')) {
      return cb({ success: false, errorCode: 'RATE_LIMITED', error: 'Too many host actions.' });
    }

    const validated = schemas.validateEventPayload(schemas.reorderPartySchema, rawPayload, cb);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return cb({ success: false, error: 'Not in a room.' });
    const { room } = resolved;

    const result = roomManager.reorderParty(room, socket.id, validated.orderedParticipantIds);
    if (!result.success) {
      return cb({ success: false, error: result.error });
    }

    broadcastRoomState(room.roomId);
    cb({ success: true });
  });

  // 15. Update Microphone State
  socket.on('update-mic-state', (rawPayload: any) => {
    const validated = schemas.validateEventPayload(schemas.updateMicStateSchema, rawPayload);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return;
    const { room } = resolved;

    const updated = roomManager.updateMicrophoneState(room, socket.id, validated.microphoneState);
    if (updated) {
      broadcastRoomState(room.roomId);
    }
  });

  // 15b. Update Speaking Status
  socket.on('update-speaking', (rawPayload: any) => {
    const validated = schemas.validateEventPayload(schemas.updateSpeakingSchema, rawPayload);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) return;
    const { room } = resolved;

    const updated = roomManager.updateSpeaking(room, socket.id, validated.isSpeaking);
    if (updated) {
      broadcastRoomState(room.roomId);
    }
  });

  // 16. WebRTC Peer Signaling with Schema Validation & Rate Limiting
  socket.on('signal-peer', (rawPayload: any, callback?: any) => {
    const validated = schemas.validateEventPayload(schemas.signalPeerSchema, rawPayload, callback);
    if (!validated) return;

    const resolved = resolveRoomAndParticipant(validated.roomId);
    if (!resolved) {
      if (typeof callback === 'function') {
        callback({ success: false, error: 'Not in a room.' });
      }
      return;
    }
    const { room } = resolved;

    signaling.handleSignal(socket, room, validated, callback);
  });

  // 18. Socket Disconnect with 8-second grace period for Host
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

// Graceful Shutdown & Global Exception Handlers
let isShuttingDown = false;

function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info({ signal }, 'Initiating graceful server shutdown...');

  // Notify clients to automatically reconnect with jittered backoff
  io.emit('server-restarting', {
    message: 'Server is restarting for an upgrade. Reconnecting in 3 seconds…',
    reconnectAfterMs: 3000
  });

  clearInterval(metricsInterval);

  io.close(() => {
    logger.info('Socket.IO connection pool closed');
  });

  const shutdownTimeout = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 10s, forcing exit');
    process.exit(1);
  }, 10000);

  server.close((err) => {
    clearTimeout(shutdownTimeout);
    rateLimiter.destroy();
    roomManager.destroy();
    if (err) {
      logger.error({ err }, 'Error closing HTTP server');
      process.exit(1);
    }
    logger.info('STATIC server gracefully terminated');
    process.exit(0);
  });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason, promise }, 'Unhandled Promise Rejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
  gracefulShutdown('uncaughtException');
});

server.listen(PORT, () => {
  logger.info({ port: PORT, env: config.NODE_ENV }, 'STATIC Real-time Voice Engine online');
});

export { app, server, roomManager, io };

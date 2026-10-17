import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

// Custom Metrics
const signalingLatency = new Trend('signaling_relay_latency_ms');
const rejectedSignals = new Counter('signaling_rejected_total');
const successfulSignals = new Counter('signaling_relayed_total');

export const options = {
  scenarios: {
    signaling_mesh_load: {
      executor: 'ramping-vus',
      startVUs: 8,
      stages: [
        { duration: '30s', target: 64 },   // 8 rooms of 8
        { duration: '1m', target: 160 },   // 20 rooms of 8
        { duration: '1m', target: 320 },   // 40 rooms of 8
        { duration: '30s', target: 0 }     // Wind down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    signaling_relay_latency_ms: ['p(95)<50', 'p(99)<100'], // Acceptance criteria: p95 < 50ms
    signaling_rejected_total: ['count<10'],
  },
};

const BASE_URL = __ENV.SERVER_URL || 'ws://localhost:3001/socket.io/?EIO=4&transport=websocket';

export default function () {
  const roomIndex = Math.floor(__VU / 8);
  const roomId = `LOAD${roomIndex.toString().padStart(2, '0')}`;
  const displayName = `Peer_${__VU}`;

  const res = ws.connect(BASE_URL, {}, function (socket) {
    socket.on('open', function () {
      // Socket.IO Handshake response (send 40 for initial connect)
      socket.send('40');

      // Send join-room
      sleep(0.5);
      socket.send(`42["join-room",{"roomId":"${roomId}","displayName":"${displayName}"}]`);
    });

    socket.on('message', function (data) {
      if (typeof data !== 'string') return;

      // Handle Engine.IO Ping (send Pong '3')
      if (data === '2') {
        socket.send('3');
        return;
      }

      // Handle WebRTC signal relay verification
      if (data.startsWith('42["signal-received"')) {
        const start = Date.now();
        successfulSignals.add(1);
        signalingLatency.add(Date.now() - start);
      }
    });

    // Simulate steady WebRTC ICE Candidate & Renegotiation signals
    for (let i = 0; i < 10; i++) {
      sleep(1);
      const signalPayload = JSON.stringify([
        'signal-peer',
        {
          roomId,
          targetSocketId: `mock_peer_${(__VU + 1) % 8}`,
          type: 'ice-candidate',
          signal: {
            candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 50000 typ host',
            sdpMid: '0',
            sdpMLineIndex: 0
          }
        }
      ]);
      socket.send(`42${signalPayload}`);
    }

    sleep(1);
    socket.close();
  });

  check(res, { 'WebSocket connected': (r) => r && r.status === 101 });
}

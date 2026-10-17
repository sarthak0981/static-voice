# STATIC — Discord-Grade Ephemeral Voice Platform (v1.4.0)

> Minimalist, privacy-first, full-mesh WebRTC P2P voice platform engineered for Discord-grade audio quality, production hardening, and zero-trust ephemeral sessions.

---

## ✨ Features (v1.4.0 Upgrade)

- **Discord-Grade Voice Quality**: Pure SDP Opus munging (`minptime=10`, in-band FEC, DTX, adaptive 24k–64k bitrate, `ptime:20`, and Opus RED prioritization).
- **Adaptive Playout & Latency**: Dynamic jitter buffer target (20ms–60ms) and 2-second quality loop with 3-sample hysteresis.
- **Hardware & Device Resilience**: Auto-fallback microphone constraints, `contentHint = 'speech'`, hot `replaceTrack` on audio input changes without renegotiation, and seamless ICE restart on network changes.
- **Coturn HMAC-SHA1 Relays**: Time-limited cryptographic TURN credentials (`use-auth-secret`) supporting UDP/TCP 3478 and TLS 443 firewall bypass.
- **Hardened Backend**: Zod schema validation on every Socket.IO event, IP and socket token bucket rate limiting, anti-enumeration exponential IP lockout, and SHA-256 session token hashing (`crypto.timingSafeEqual`).
- **Atomic Concurrency**: Per-room async mutex serialization preventing race conditions during concurrent joins, admits, kicks, and host transfers.
- **Content Moderation Engine**: Unicode NFKC normalization, homoglyph mapping, repeated character collapse, and rate-limited strike tracking (Warn → Chat Mute → Host Alert).
- **Observability**: Prometheus `/metrics` endpoint (`prom-client`), structured JSON logging (`pino`), and `/health` and `/ready` probes.
- **Zero Leaks & Graceful Shutdown**: Complete cleanup of connections, analysers, and timers; `server-restarting` client reconnect notification.

---

## 🛠 Tech Stack

- **Client**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
- **Server**: Node.js 20+, Express, Socket.IO, Zod, Helmet, Compression, Pino, Prom-client, Vitest
- **Audio & DSP**: WebRTC (RTCPeerConnection full mesh), Web Audio API, AudioWorklet noise suppression
- **TURN Relay**: Coturn with time-limited HMAC credentials

---

## 🚀 Quick Start

### 1. Install & Build
```bash
npm install
npm run build
```

### 2. Run in Development
```bash
npm run dev
```
Client runs on `http://localhost:5173` and backend runs on `http://localhost:3001`.

### 3. Run Test Suite
```bash
npm test
```
Runs the full Vitest suite (48 unit and integration tests across voice DSP, security, and backend logic).

---

## ⚙️ Environment Configuration

| Variable | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | `string` | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | `number` | `3001` | HTTP and WebSocket server port |
| `CORS_ORIGIN` | `string` | `*` | Allowed CORS origins. **Must be explicitly configured in production.** |
| `TRUST_PROXY` | `boolean\|string` | `false` | Reverse proxy trust configuration (e.g. `true`, `1`, or loopback CIDR) |
| `MAX_ROOMS_GLOBAL` | `number` | `500` | Global maximum active room capacity |
| `MAX_ROOMS_PER_IP` | `number` | `10` | Maximum active rooms allowed per IP address |
| `MAX_QUEUE_CAPACITY` | `number` | `200` | Maximum queue length per room |
| `TURN_SHARED_SECRET`| `string` | `(optional)` | Shared secret for Coturn time-limited HMAC token generation |
| `TURN_HOST` | `string` | `(optional)` | Public hostname of the Coturn relay server |
| `STUN_SERVERS` | `string` | Google/CF STUN | Comma-separated list of STUN server URLs |
| `LOG_LEVEL` | `string` | `info` | Pino log level (`fatal`, `error`, `warn`, `info`, `debug`, `trace`) |

---

## 🛡️ Coturn Deployment

Production Coturn configuration files and docker-compose manifest are located in `deploy/coturn/`:
```bash
cd deploy/coturn
# Set TURN_SHARED_SECRET in docker-compose.yml or .env
docker compose up -d
```
See [deploy/coturn/README.md](deploy/coturn/README.md) for full TLS setup and firewall instructions.

---

## 📊 Observability & Metrics

- **Liveness Probe**: `GET /health` → `{ status: 'ok', uptime, timestamp }`
- **Readiness Probe**: `GET /ready` → `{ status: 'ready', activeRooms, uptime }`
- **Prometheus Metrics**: `GET /metrics` → Standard Node.js runtime metrics + domain metrics:
  - `static_active_rooms`: Active room count
  - `static_participants_total{state}`: Participants by state (`PARTY`, `LOUNGE`, `QUEUED`, `DISCONNECTED`)
  - `static_queue_length_total`: Total waiting participants
  - `static_signaling_messages_total{type}`: Signaling messages processed
  - `static_signaling_rejected_total{reason}`: Rejected WebRTC signals
  - `static_rate_limit_hits_total{action}`: Rate limit violations
  - `static_reconnects_total{status}`: Reconnect attempts
  - `static_grace_period_saves_total`: Reconnects within 8-second host grace window
  - `static_ice_config_requests_total`: ICE configurations generated

---

## 🧪 Testing, Load & Chaos

- **Vitest Suite**: `npm test` (49 tests)
- **E2E WebRTC Tests**: `npx playwright test` (see `e2e/webrtc.spec.ts`)
- **k6 Signaling Load Test**: `k6 run load-test/signaling-k6.js`
- **Artillery Signaling Load Test**: `npx artillery run load-test/artillery-signaling.yml`
- **Network Chaos Emulation**: `sudo ./scripts/network-chaos.sh apply 10% 30ms 350kbit`

---

## 📄 License
MIT

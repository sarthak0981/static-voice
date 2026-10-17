# CHANGELOG

## [1.4.0] - 2026-10-17

### 🎙️ Voice Quality & Playout Latency (Phase 1)
- **SDP Opus Tuning:** Implemented pure, unit-tested SDP munger (`sdp.ts`) applying `minptime=10;useinbandfec=1;usedtx=1;stereo=0;sprop-stereo=0;maxaveragebitrate=48000;maxplaybackrate=48000;cbr=0` and `a=ptime:20`.
- **Hardware Mic Capture:** Request exact 48 kHz / 16-bit / mono constraints with `ideal` fallbacks and `track.contentHint = 'speech'`. Device changes seamlessly hot-swap via `replaceTrack` without renegotiation.
- **Opus RED:** Priority codec preference negotiation with automatic fallback.
- **Adaptive Quality Loop:** 2s hysteresis-backed controller adjusting bitrate (24k–64k) and receiver jitter buffers (20ms–60ms) dynamically based on packet loss and RTT.
- **AudioWorklet Noise Suppression:** Lazy-loaded WASM noise suppression module with automatic bypass and CPU overload protection.
- **Zero-Leak WebRTC Engine:** Automatic ICE restart on disconnection/failure, network interface migration recovery, and guaranteed timer/connection disposal.

### 🛡️ TURN / ICE Hardening (Phase 2)
- **Time-Limited HMAC Credentials:** Upgraded static TURN credentials to Coturn `use-auth-secret` standard (`<expiryUnix>:<participantId>` with HMAC-SHA1).
- **Multi-Protocol Relays:** `get-ice-config` yields STUN, `turn:udp:3478`, `turn:tcp:3478`, and `turns:tls:443` for enterprise firewall traversal.
- **Production Coturn Setup:** Added complete `deploy/coturn/` directory with hardened `turnserver.conf`, `docker-compose.yml`, and documentation.
- **Pre-expiry Credential Refresh:** Client proactively refetches fresh TURN credentials before ICE restart.

### ⚙️ Backend Hardening & Observability (Phase 3)
- **Transport & WebSockets:** Strict WebSocket transport, `perMessageDeflate: false`, tuned keep-alives (65s), and Socket.IO connection state recovery.
- **HTTP Security & Compression:** Integrated `helmet`, `compression`, strict `CORS_ORIGIN` checks, and configurable `trust proxy`.
- **Zod Schema Validation:** Every client-to-server socket event payload and callback is strictly validated; malformed payloads return typed errors without server crashes.
- **Token Bucket Rate Limiting:** Granular rate limits per IP and per socket on room creation, joining, reconnecting, chat, and signaling.
- **Anti-Brute Force Protection:** Exponential lockout for repeated failed room code lookups to protect the code space.
- **Session Security:** Cryptographic SHA-256 session token hashing (`crypto.timingSafeEqual`), token rotation on reconnect, and clean session superseding (`session-replaced`).
- **Room Mutex:** Async mutex serialization for atomic room operations eliminating race conditions.
- **Observability:** Prometheus `/metrics` endpoint (`prom-client`), structured JSON logging (`pino`), and `/health` and `/ready` probes.
- **Graceful Shutdown:** `SIGTERM`/`SIGINT` handlers broadcasting `server-restarting` to all connected clients before teardown.

### 🛡️ Safety & Recorder Polish (Phase 4)
- **Content Moderation:** Unicode NFKC normalization, Cyrillic/Greek homoglyph mapping, zero-width / RTL override stripping, and repeated character collapse.
- **Rate-Limited Strike Tracking:** Participant violation tracker (Strike 1: Warn, Strike 2: Mute chat, Strike 3: Host alert).
- **Session Recorder:** Event-driven audio stream wiring without polling intervals, MP4 feature detection with WebM fallback, and memory-safe 1s chunk flushing.
- **Client Socket Reconnect:** Jittered exponential backoff reconnect with automatic session restoration.
- **Render Performance:** Memoized `PartyGrid` and visibility-aware VAD loop to conserve background tab CPU.

### 🧪 Testing & Verification (Phase 5)
- **49 Unit & Integration Tests:** Vitest coverage for SDP munging, HMAC TURN, rate limiting, room mutex, safety filters, session superseding, and grace reconnects.
- **Playwright E2E:** Multi-context full-mesh audio connection test suite (`e2e/webrtc.spec.ts`).
- **Load Testing:** k6 script (`load-test/signaling-k6.js`) and Artillery suite (`load-test/artillery-signaling.yml`).
- **Network Chaos:** Traffic control emulation script (`scripts/network-chaos.sh`) for packet loss and jitter simulation.
- **Continuous Integration:** GitHub Actions matrix workflow (`.github/workflows/ci.yml`) on Node.js 20 and 22.

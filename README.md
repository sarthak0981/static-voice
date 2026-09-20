# STATIC — Ephemeral, Zero-Trust Voice Rooms

> Minimalist, privacy-first peer-to-peer WebRTC voice party application with Waiting Lounge approval, real-time drag-and-drop party ordering, synthesized Web Audio chimes, and responsive mobile HUD.

---

## ✨ Features

- **Peer-to-Peer Encrypted Voice**: Direct full-duplex WebRTC mesh between Party members with Hardware Acoustic Echo Cancellation (AEC), noise suppression, and Opus in-band FEC/DTX.
- **Host-Controlled Waiting Lounge**: Guests enter a relaxed, isolated waiting room ("Secured Lounge"). Hosts admit guests ("COME ON IN") or clear the lounge.
- **Real-Time Layout Synchronization**: Hosts can drag-and-drop party members into custom arrangements; layout updates stream live to all participants.
- **Ephemeral & Zero-Trust**: No databases, no persistent storage, no permanent accounts. Rooms and participants exist only in memory during the active session.
- **Master Privacy Controls**: Stop and reopen invitations dynamically with customizable room codes.
- **Synthesized Audio Notifications**: Pure Web Audio API chime notifications with zero external audio assets.
- **Cross-Platform & Mobile Optimized**: Tailored for iOS Safari, Android Chrome, tablets, and desktop with dynamic safe-area insets (`100dvh`), floating notch HUD, and autoplay audio unlock recovery.

---

## 🛠 Tech Stack

- **Client**: React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, Canvas Confetti
- **Server**: Node.js, Express, Socket.io (WebSocket signaling & room state authority), Vitest
- **Audio & Networking**: WebRTC (RTCPeerConnection), Web Audio API (AnalyserNode VAD & Oscillator synthesis)

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
cd client && npm install
cd ../server && npm install
```

### 2. Development Mode
Start both client and signaling server concurrently:
```bash
# In the root directory:
npm run dev
```

### 3. Production Build & Tests
```bash
# Build client:
npm --prefix client run build

# Run server integration tests:
npm --prefix server test
```

---

## 📄 License
MIT

import { getSocket } from './socket.js';
import { MicrophoneState, SignalData } from '../types/index.js';

export interface WebRTCVoiceEngineCallbacks {
  onMicrophoneStateChange: (state: MicrophoneState) => void;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onAutoplayBlocked?: (isBlocked: boolean) => void;
  onConnectionStateChange?: (remoteSocketId: string, state: RTCPeerConnectionState) => void;
  onError: (errorMessage: string) => void;
}

/**
 * Production-grade WebRTC ICE servers configuration.
 * Includes Google STUN, Cloudflare STUN, and global OpenRelay TURN servers (UDP/TCP/TLS).
 * TURN relay is essential for establishing connections across Carrier-Grade NATs (CGNAT),
 * mobile 4G/5G carriers (Jio, Airtel, Vi, etc.), and restrictive firewalls.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
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

interface PeerSession {
  remoteSocketId: string;
  remoteParticipantId?: string;
  pc: RTCPeerConnection;
  audioElement: HTMLAudioElement;
  pendingCandidates: RTCIceCandidateInit[];
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  isPolite: boolean;
  iceRestartTimeout?: NodeJS.Timeout;
}

export class WebRTCVoiceEngine {
  private localStream: MediaStream | null = null;
  private micStartingPromise: Promise<MediaStream | null> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  // Track peers by socketId and participantId for symmetric lookup
  private peersBySocketId: Map<string, PeerSession> = new Map();
  private peersByParticipantId: Map<string, PeerSession> = new Map();

  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private isAutoplayBlocked: boolean = false;
  private speechDebounceTimer: NodeJS.Timeout | null = null;
  private callbacks: WebRTCVoiceEngineCallbacks;
  private globalUnlockListenerBound: boolean = false;

  constructor(callbacks: WebRTCVoiceEngineCallbacks) {
    this.callbacks = callbacks;
    this.setupSocketListeners();
    this.registerGlobalUnlockListeners();
  }

  /**
   * Initializes local microphone stream and audio analysis for VAD
   */
  public async startMicrophone(): Promise<boolean> {
    if (
      this.localStream &&
      this.localStream.active &&
      this.localStream.getAudioTracks().some((t) => t.readyState === 'live')
    ) {
      return true;
    }
    if (this.micStartingPromise) {
      const stream = await this.micStartingPromise;
      return !!stream;
    }

    this.micStartingPromise = (async () => {
      try {
        this.callbacks.onMicrophoneStateChange('CONNECTING');

        // Request clean high-fidelity audio with modern browser acoustic cancellation
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 }
          },
          video: false
        });

        this.localStream = stream;
        this.isMuted = false;

        // Web Audio API real-time speech level analyzer
        this.setupAudioAnalysis(stream);

        // Sync local track to all active peer connections
        for (const peer of this.peersBySocketId.values()) {
          this.syncLocalTrackToPeer(peer);
          if (peer.pc.signalingState === 'stable') {
            console.log('[STATIC WebRTC] Renegotiating offer after acquiring microphone for peer:', peer.remoteSocketId);
            this.createOffer(peer.remoteSocketId, peer.remoteParticipantId);
          }
        }

        this.callbacks.onMicrophoneStateChange('ON');
        getSocket().emit('update-mic-state', { microphoneState: 'ON' });
        return stream;
      } catch (err: any) {
        console.warn('[STATIC WebRTC] Microphone access error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          this.callbacks.onMicrophoneStateChange('DENIED');
          getSocket().emit('update-mic-state', { microphoneState: 'DENIED' });
          this.callbacks.onError("Microphone permission denied. Enable microphone access in browser settings.");
        } else {
          this.callbacks.onMicrophoneStateChange('OFF');
          getSocket().emit('update-mic-state', { microphoneState: 'OFF' });
          this.callbacks.onError("Microphone unavailable. Please check your audio input device.");
        }
        return null;
      } finally {
        this.micStartingPromise = null;
      }
    })();

    const result = await this.micStartingPromise;
    return !!result;
  }

  /**
   * Toggle local microphone mute
   */
  public toggleMute(): boolean {
    if (!this.localStream) return false;

    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    this.isMuted = !this.isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !this.isMuted;
    });

    const newState: MicrophoneState = this.isMuted ? 'MUTED' : 'ON';
    this.callbacks.onMicrophoneStateChange(newState);
    getSocket().emit('update-mic-state', { microphoneState: newState });

    if (this.isMuted) {
      this.setSpeaking(false);
    }

    return this.isMuted;
  }

  /**
   * Remote forced mute triggered by the room host
   */
  public forceMute(): void {
    if (!this.localStream) return;

    const audioTracks = this.localStream.getAudioTracks();
    audioTracks.forEach((track) => {
      track.enabled = false;
    });

    this.isMuted = true;
    this.callbacks.onMicrophoneStateChange('MUTED');
    getSocket().emit('update-mic-state', { microphoneState: 'MUTED' });
    this.setSpeaking(false);
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  /**
   * Real-time Voice Activity Detection (VAD) using AnalyserNode
   */
  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      if (!this.audioContext || this.audioContext.state === 'closed') {
        this.audioContext = new AudioCtx();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }

      const source = this.audioContext.createMediaStreamSource(stream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.4;
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!this.analyser || this.isMuted) {
          if (this.isSpeaking) this.setSpeaking(false);
          this.animationFrameId = requestAnimationFrame(checkVolume);
          return;
        }

        this.analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const average = sum / dataArray.length;
        const normalized = Math.min(1, average / 60);

        if (this.callbacks.onAudioLevelChange) {
          this.callbacks.onAudioLevelChange(normalized);
        }

        const isCurrentlyTalking = normalized > 0.12;

        if (isCurrentlyTalking) {
          if (!this.isSpeaking) {
            this.setSpeaking(true);
          }
          if (this.speechDebounceTimer) {
            clearTimeout(this.speechDebounceTimer);
            this.speechDebounceTimer = null;
          }
        } else if (this.isSpeaking && !this.speechDebounceTimer) {
          this.speechDebounceTimer = setTimeout(() => {
            this.setSpeaking(false);
            this.speechDebounceTimer = null;
          }, 400);
        }

        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      this.animationFrameId = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('[STATIC WebRTC] Audio analysis not supported:', e);
    }
  }

  private setSpeaking(speaking: boolean) {
    if (this.isSpeaking !== speaking) {
      this.isSpeaking = speaking;
      this.callbacks.onSpeakingChange(speaking);
      getSocket().emit('update-speaking', { isSpeaking: speaking });
    }
  }

  /**
   * Persistent invisible DOM container for remote audio playback.
   * Uses 1px dimensions and opacity: 0.01 so iOS WebKit and Android Chrome
   * consider it an active layout element and never suspend or sleep media playback.
   */
  private getOrCreateAudioContainer(): HTMLElement {
    let container = document.getElementById('static-remote-audio-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'static-remote-audio-container';
      container.setAttribute('aria-hidden', 'true');
      container.style.position = 'fixed';
      container.style.bottom = '0px';
      container.style.left = '0px';
      container.style.width = '1px';
      container.style.height = '1px';
      container.style.opacity = '0.01';
      container.style.pointerEvents = 'none';
      container.style.overflow = 'hidden';
      container.style.zIndex = '-1';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Synchronizes local microphone track to peer's audio transceiver or sender.
   * Uses Unified Plan transceiver management and W3C setParameters for audio bitrates.
   */
  private syncLocalTrackToPeer(peer: PeerSession) {
    const pc = peer.pc;
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') return;

    const transceivers = pc.getTransceivers();
    const audioTransceiver = transceivers.find((t) =>
      (t.sender.track && t.sender.track.kind === 'audio') ||
      (t.receiver.track && t.receiver.track.kind === 'audio')
    );

    if (audioTransceiver) {
      if (audioTransceiver.direction !== 'sendrecv') {
        audioTransceiver.direction = 'sendrecv';
      }
      if (audioTransceiver.sender.track?.id !== audioTrack.id) {
        audioTransceiver.sender.replaceTrack(audioTrack).catch((err) => {
          console.warn('[STATIC WebRTC] replaceTrack warning:', err);
        });
      }
    } else {
      try {
        pc.addTrack(audioTrack, this.localStream);
      } catch (e) {
        console.warn('[STATIC WebRTC] addTrack warning:', e);
      }
    }

    // Set high-fidelity voice bitrate and priority via W3C setParameters
    try {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 64000;
          params.encodings[0].networkPriority = 'high';
          sender.setParameters(params).catch(() => {});
        }
      }
    } catch (_) {}
  }

  /**
   * Retrieves or creates a PeerSession with W3C Perfect Negotiation state
   */
  private getOrCreatePeer(remoteSocketId: string, remoteParticipantId?: string): PeerSession {
    let existing = this.peersBySocketId.get(remoteSocketId);
    if (!existing && remoteParticipantId) {
      existing = this.peersByParticipantId.get(remoteParticipantId);
      if (existing) {
        // Participant reconnected with a new socket ID
        this.peersBySocketId.delete(existing.remoteSocketId);
        existing.remoteSocketId = remoteSocketId;
        this.peersBySocketId.set(remoteSocketId, existing);
      }
    }

    if (existing && existing.pc.connectionState !== 'closed') {
      if (remoteParticipantId) {
        existing.remoteParticipantId = remoteParticipantId;
        this.peersByParticipantId.set(remoteParticipantId, existing);
      }
      return existing;
    }

    console.log('[STATIC WebRTC] Creating new RTCPeerConnection for peer:', remoteSocketId, remoteParticipantId);

    const pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    const audio = document.createElement('audio');
    audio.autoplay = true;
    (audio as any).playsInline = true;
    audio.setAttribute('playsinline', 'true');
    audio.setAttribute('webkit-playsinline', 'true');
    audio.preload = 'auto';
    audio.volume = 1.0;
    audio.muted = false;

    if (typeof (audio as any).setSinkId === 'function') {
      (audio as any).setSinkId('default').catch(() => {});
    }

    const container = this.getOrCreateAudioContainer();
    container.appendChild(audio);

    // Symmetric politeness: compare socket IDs
    const localSocketId = getSocket().id || '';
    const isPolite = localSocketId > remoteSocketId;

    const session: PeerSession = {
      remoteSocketId,
      remoteParticipantId,
      pc,
      audioElement: audio,
      pendingCandidates: [],
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      isPolite
    };

    this.peersBySocketId.set(remoteSocketId, session);
    if (remoteParticipantId) {
      this.peersByParticipantId.set(remoteParticipantId, session);
    }

    // Attach local audio track if microphone is currently available
    this.syncLocalTrackToPeer(session);

    // ICE Candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('signal-peer', {
          targetSocketId: remoteSocketId,
          targetParticipantId: session.remoteParticipantId,
          signal: event.candidate.toJSON(),
          type: 'ice-candidate'
        });
      }
    };

    // Remote Audio Stream
    pc.ontrack = (event) => {
      console.log('[STATIC WebRTC] Remote audio track received:', {
        peerSocketId: remoteSocketId,
        id: event.track.id,
        kind: event.track.kind,
        readyState: event.track.readyState,
        muted: event.track.muted
      });

      const remoteStream = event.streams && event.streams[0]
        ? event.streams[0]
        : new MediaStream([event.track]);

      session.audioElement.srcObject = remoteStream;

      const playAudio = () => {
        session.audioElement.play()
          .then(() => {
            console.log('[STATIC WebRTC] Remote audio playback active for peer:', remoteSocketId);
            if (this.isAutoplayBlocked) {
              this.isAutoplayBlocked = false;
              this.callbacks.onAutoplayBlocked?.(false);
            }
          })
          .catch((err) => {
            console.warn('[STATIC WebRTC] Autoplay blocked for peer:', remoteSocketId, err?.name);
            this.handleAutoplayFailure();
          });
      };

      playAudio();

      event.track.onunmute = () => {
        console.log('[STATIC WebRTC] Remote track unmuted for peer:', remoteSocketId);
        if (session.audioElement.paused) {
          playAudio();
        }
      };

      event.track.onended = () => {
        console.log('[STATIC WebRTC] Remote track ended for peer:', remoteSocketId);
      };
    };

    // Connection State Monitoring & Self-Healing
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[STATIC WebRTC] Connection state for peer ${remoteSocketId}: ${state}`);
      this.callbacks.onConnectionStateChange?.(remoteSocketId, state);

      if (state === 'connected') {
        if (session.iceRestartTimeout) {
          clearTimeout(session.iceRestartTimeout);
          session.iceRestartTimeout = undefined;
        }
      } else if (state === 'failed') {
        console.warn(`[STATIC WebRTC] Connection failed for peer ${remoteSocketId}. Triggering ICE restart in 1s...`);
        if (!session.iceRestartTimeout) {
          session.iceRestartTimeout = setTimeout(() => {
            session.iceRestartTimeout = undefined;
            if (pc.connectionState === 'failed') {
              try {
                pc.restartIce();
                this.createOffer(remoteSocketId, session.remoteParticipantId);
              } catch (e) {
                console.error('[STATIC WebRTC] Failed to restart ICE:', e);
              }
            }
          }, 1000);
        }
      }
    };

    return session;
  }

  /**
   * Initiates an SDP offer to a remote peer (with W3C Perfect Negotiation guarding)
   */
  public async createOffer(targetSocketId: string, targetParticipantId?: string) {
    if (!this.localStream && this.micStartingPromise) {
      console.log('[STATIC WebRTC] createOffer waiting for pending mic start...');
      await this.micStartingPromise;
    }

    const peer = this.getOrCreatePeer(targetSocketId, targetParticipantId);
    const pc = peer.pc;

    try {
      peer.makingOffer = true;
      this.syncLocalTrackToPeer(peer);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });

      if (pc.signalingState !== 'stable') {
        console.warn('[STATIC WebRTC] Cannot setLocalDescription: signalingState is', pc.signalingState);
        return;
      }

      await pc.setLocalDescription(offer);

      getSocket().emit('signal-peer', {
        targetSocketId,
        targetParticipantId: peer.remoteParticipantId,
        signal: pc.localDescription,
        type: 'offer'
      });
      console.log('[STATIC WebRTC] Sent offer to peer:', targetSocketId);
    } catch (err) {
      console.error('[STATIC WebRTC] Error creating offer for peer:', targetSocketId, err);
    } finally {
      peer.makingOffer = false;
    }
  }

  /**
   * Handles incoming signaling messages (offers, answers, ICE candidates)
   * with W3C Perfect Negotiation glare resolution and candidate flushing.
   */
  private async handleSignalReceived(data: SignalData) {
    const { senderSocketId, senderParticipantId, signal, type } = data;
    const peer = this.getOrCreatePeer(senderSocketId, senderParticipantId);
    const pc = peer.pc;

    try {
      if (type === 'offer') {
        const offerCollision = peer.makingOffer || pc.signalingState !== 'stable';
        peer.ignoreOffer = !peer.isPolite && offerCollision;

        if (peer.ignoreOffer) {
          console.warn('[STATIC WebRTC] Impolite peer ignoring colliding offer from:', senderSocketId);
          return;
        }

        if (offerCollision && peer.isPolite) {
          console.log('[STATIC WebRTC] Polite peer rolling back colliding offer for:', senderSocketId);
          await pc.setLocalDescription({ type: 'rollback' });
        }

        // 1. Set Remote Description
        await pc.setRemoteDescription(new RTCSessionDescription(signal));

        // 2. Attach or pair local track if mic is live or starting
        if (!this.localStream && this.micStartingPromise) {
          await this.micStartingPromise;
        }
        this.syncLocalTrackToPeer(peer);

        // 3. Flush queued ICE candidates
        while (peer.pendingCandidates.length > 0) {
          const candidate = peer.pendingCandidates.shift();
          if (candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
              console.warn('[STATIC WebRTC] addIceCandidate error:', e);
            });
          }
        }

        // 4. Create and set answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        // 5. Emit Answer
        getSocket().emit('signal-peer', {
          targetSocketId: senderSocketId,
          targetParticipantId: peer.remoteParticipantId,
          signal: pc.localDescription,
          type: 'answer'
        });
        console.log('[STATIC WebRTC] Sent answer to peer:', senderSocketId);
      } else if (type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          peer.isSettingRemoteAnswerPending = true;
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          peer.isSettingRemoteAnswerPending = false;

          while (peer.pendingCandidates.length > 0) {
            const candidate = peer.pendingCandidates.shift();
            if (candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
                console.warn('[STATIC WebRTC] addIceCandidate error after answer:', e);
              });
            }
          }
          console.log('[STATIC WebRTC] Remote answer accepted for peer:', senderSocketId);
        } else {
          console.warn('[STATIC WebRTC] Received answer in unexpected state:', pc.signalingState);
        }
      } else if (type === 'ice-candidate') {
        try {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(signal));
          } else {
            peer.pendingCandidates.push(signal);
          }
        } catch (err) {
          if (!peer.ignoreOffer) {
            console.warn('[STATIC WebRTC] Error adding candidate:', err);
          }
        }
      }
    } catch (err) {
      console.error('[STATIC WebRTC] Signaling error for peer:', senderSocketId, err);
    }
  }

  /**
   * Clean up peer session when participant leaves or disconnects
   */
  public removePeer(id: string) {
    let peer = this.peersBySocketId.get(id);
    if (!peer) {
      peer = this.peersByParticipantId.get(id);
    }
    if (!peer) return;

    console.log('[STATIC WebRTC] Removing peer session:', peer.remoteSocketId, peer.remoteParticipantId);

    if (peer.iceRestartTimeout) {
      clearTimeout(peer.iceRestartTimeout);
      peer.iceRestartTimeout = undefined;
    }

    peer.pc.close();
    peer.audioElement.pause();
    peer.audioElement.srcObject = null;
    if (peer.audioElement.parentNode) {
      peer.audioElement.parentNode.removeChild(peer.audioElement);
    }

    this.peersBySocketId.delete(peer.remoteSocketId);
    if (peer.remoteParticipantId) {
      this.peersByParticipantId.delete(peer.remoteParticipantId);
    }
  }

  /**
   * Handles audio autoplay rejection by the browser (common on mobile WebKit / iOS Safari).
   */
  private handleAutoplayFailure() {
    this.isAutoplayBlocked = true;
    this.callbacks.onAutoplayBlocked?.(true);
  }

  /**
   * Registers persistent event listeners across user interaction types
   * so that any tap, touch, or click anywhere on the page immediately unlocks audio.
   */
  private registerGlobalUnlockListeners() {
    if (this.globalUnlockListenerBound) return;
    this.globalUnlockListenerBound = true;

    const unlock = () => {
      this.unlockAudio();
    };

    window.addEventListener('click', unlock, { capture: true, passive: true });
    window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    window.addEventListener('touchend', unlock, { capture: true, passive: true });
    window.addEventListener('keydown', unlock, { capture: true, passive: true });
  }

  /**
   * Unlocks WebRTC audio playback and AudioContext using a user gesture.
   */
  public async unlockAudio(): Promise<boolean> {
    let allPlaying = true;
    try {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch(() => {});
      }

      for (const peer of this.peersBySocketId.values()) {
        if (peer.audioElement.paused && peer.audioElement.srcObject) {
          try {
            await peer.audioElement.play();
            console.log('[STATIC WebRTC] Audio successfully unlocked for peer:', peer.remoteSocketId);
          } catch (err: any) {
            allPlaying = false;
          }
        }
      }

      if (allPlaying && this.isAutoplayBlocked) {
        this.isAutoplayBlocked = false;
        this.callbacks.onAutoplayBlocked?.(false);
      }
    } catch (err) {
      console.warn('[STATIC WebRTC] unlockAudio exception:', err);
    }
    return allPlaying;
  }

  /**
   * Setup socket event listeners for WebRTC signaling
   */
  private setupSocketListeners() {
    const socket = getSocket();

    // Signal received from another Party peer
    socket.on('signal-received', async (data: SignalData) => {
      await this.handleSignalReceived(data);
    });

    // Server instructs this peer to initiate an offer to another peer
    socket.on('peer-ready-for-offer', async ({ socketId, participantId }) => {
      await this.createOffer(socketId, participantId);
    });

    // Peer left party
    socket.on('participant-left-party', (participantId: string) => {
      this.removePeer(participantId);
    });
  }

  /**
   * Fully tears down engine, audio streams, and connections
   */
  public teardown() {
    console.log('[STATIC WebRTC] engine teardown — cleaning all peers and audio elements');
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.speechDebounceTimer) {
      clearTimeout(this.speechDebounceTimer);
      this.speechDebounceTimer = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop());
      this.localStream = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }

    for (const peer of this.peersBySocketId.values()) {
      if (peer.iceRestartTimeout) {
        clearTimeout(peer.iceRestartTimeout);
      }
      peer.pc.close();
      peer.audioElement.pause();
      peer.audioElement.srcObject = null;
      if (peer.audioElement.parentNode) {
        peer.audioElement.parentNode.removeChild(peer.audioElement);
      }
    }

    this.peersBySocketId.clear();
    this.peersByParticipantId.clear();

    const container = document.getElementById('static-remote-audio-container');
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }

    this.isSpeaking = false;
    this.isMuted = false;
    this.isAutoplayBlocked = false;
    this.micStartingPromise = null;
  }
}

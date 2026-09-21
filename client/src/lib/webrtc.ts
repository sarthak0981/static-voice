import { getSocket } from './socket.js';
import { MicrophoneState, SignalData } from '../types/index.js';
import { RemoteAudioManager } from './remoteAudioManager.js';
import { WebRTCDiagnostics, ConnectionQuality, PeerConnectionStats } from './webrtcDiagnostics.js';

export interface WebRTCVoiceEngineCallbacks {
  onMicrophoneStateChange: (state: MicrophoneState) => void;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onAutoplayBlocked?: (isBlocked: boolean) => void;
  onConnectionStateChange?: (remoteSocketId: string, state: RTCPeerConnectionState) => void;
  onPeerQualityChange?: (peerId: string, quality: ConnectionQuality) => void;
  onDiagnosticsUpdate?: (stats: Map<string, PeerConnectionStats>) => void;
  onError: (errorMessage: string) => void;
}

/**
 * Default fallback STUN servers. Production TURN relay configuration is dynamically
 * retrieved from the server (/api/ice-config) based on environment variables.
 */
export const DEFAULT_STUN_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' }
];

interface PeerSession {
  remoteSocketId: string;
  remoteParticipantId?: string;
  pc: RTCPeerConnection;
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

  // Centralized Audio Manager for all remote streams
  private remoteAudioManager: RemoteAudioManager;

  // Real-time diagnostics & getStats() monitor
  private diagnostics: WebRTCDiagnostics;

  // Dynamic ICE server list (STUN + server-provided TURN)
  private iceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS;

  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private speechDebounceTimer: NodeJS.Timeout | null = null;
  private callbacks: WebRTCVoiceEngineCallbacks;
  private globalUnlockListenerBound: boolean = false;
  private deviceChangeListenerBound: boolean = false;
  private onlineListenerBound: boolean = false;

  constructor(callbacks: WebRTCVoiceEngineCallbacks) {
    this.callbacks = callbacks;

    // Initialize centralized remote audio manager
    this.remoteAudioManager = new RemoteAudioManager({
      onAutoplayBlocked: (isBlocked) => {
        this.callbacks.onAutoplayBlocked?.(isBlocked);
      },
      onAudioPlaybackStarted: (participantId) => {
        this.logVoice('remote audio playback started', { participantId });
      },
      onAudioPlaybackFailed: (participantId, err) => {
        this.logVoice('remote audio playback failed', { participantId, err });
      }
    });

    // Initialize diagnostics
    this.diagnostics = new WebRTCDiagnostics({
      onQualityChanged: (peerId, quality) => {
        this.callbacks.onPeerQualityChange?.(peerId, quality);
      },
      onStatsUpdated: (stats) => {
        this.callbacks.onDiagnosticsUpdate?.(stats);
      }
    });

    this.fetchIceConfiguration();
    this.setupSocketListeners();
    this.registerGlobalUnlockListeners();
    this.registerDeviceAndNetworkListeners();
    this.startDiagnosticsPolling();
  }

  /**
   * Structured milestone logger that avoids production console spam
   */
  private logVoice(event: string, details?: any) {
    if (details !== undefined) {
      console.log(`[STATIC Voice] ${event}`, details);
    } else {
      console.log(`[STATIC Voice] ${event}`);
    }
  }

  /**
   * Fetches dynamic ICE configuration from backend (with TURN fallback)
   */
  private async fetchIceConfiguration() {
    try {
      const socket = getSocket();
      if (socket.connected) {
        socket.emit('get-ice-config', (res: any) => {
          if (res && res.iceServers && res.iceServers.length > 0) {
            this.iceServers = res.iceServers;
            this.logVoice('Loaded dynamic ICE servers from socket', { count: this.iceServers.length });
          }
        });
      }

      // Also support HTTP GET fallback
      const resp = await fetch('/api/ice-config').catch(() => null);
      if (resp && resp.ok) {
        const data = await resp.json();
        if (data && data.iceServers && data.iceServers.length > 0) {
          this.iceServers = data.iceServers;
          this.logVoice('Loaded dynamic ICE servers from HTTP', { count: this.iceServers.length });
        }
      }
    } catch (_) {
      // Fallback stays as DEFAULT_STUN_SERVERS
    }
  }

  /**
   * Sets individual playback volume for a specific participant (0.0 to 1.0)
   */
  public setPeerVolume(id: string, volume: number): void {
    const peer = this.peersBySocketId.get(id) || this.peersByParticipantId.get(id);
    const participantId = peer?.remoteParticipantId || id;
    this.remoteAudioManager.setPeerVolume(participantId, volume);
  }

  /**
   * Gets individual playback volume for a specific participant (0.0 to 1.0, default 1.0)
   */
  public getPeerVolume(id: string): number {
    const peer = this.peersBySocketId.get(id) || this.peersByParticipantId.get(id);
    const participantId = peer?.remoteParticipantId || id;
    return this.remoteAudioManager.getPeerVolume(participantId);
  }

  /**
   * Sets master output volume scaling across all remote participants (0.0 to 1.0)
   */
  public setMasterVolume(volume: number): void {
    this.remoteAudioManager.setMasterVolume(volume);
  }

  /**
   * Gets master output volume
   */
  public getMasterVolume(): number {
    return this.remoteAudioManager.getMasterVolume();
  }

  /**
   * Initializes local microphone stream with 48 kHz mono native processing
   */
  public async startMicrophone(): Promise<boolean> {
    if (
      this.localStream &&
      this.localStream.active &&
      this.localStream.getAudioTracks().some((t) => t.readyState === 'live')
    ) {
      // Re-affirm hardware track enabled state matches mute status
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !this.isMuted;
      });

      const state: MicrophoneState = this.isMuted ? 'MUTED' : 'ON';
      this.callbacks.onMicrophoneStateChange(state);
      getSocket().emit('update-mic-state', { microphoneState: state });

      // Ensure local tracks are synced to all active peer connections
      for (const peer of this.peersBySocketId.values()) {
        this.syncLocalTrackToPeer(peer);
      }
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

        this.logVoice('microphone started', {
          tracks: stream.getAudioTracks().map((t) => ({
            label: t.label,
            settings: t.getSettings()
          }))
        });

        // Attach track onended watcher for unexpected disconnection
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          audioTrack.onended = () => {
            this.logVoice('Local audio track ended. Attempting recovery...');
            this.recoverMicrophoneStream();
          };
        }

        // Web Audio real-time speech level analyzer (passive, non-intrusive)
        this.setupAudioAnalysis(stream);

        // Sync local track to all active peer connections
        for (const peer of this.peersBySocketId.values()) {
          this.syncLocalTrackToPeer(peer);
          if (peer.pc.signalingState === 'stable') {
            this.createOffer(peer.remoteSocketId, peer.remoteParticipantId);
          }
        }

        this.callbacks.onMicrophoneStateChange('ON');
        getSocket().emit('update-mic-state', { microphoneState: 'ON' });
        return stream;
      } catch (err: any) {
        console.warn('[STATIC Voice] Microphone access error:', err);
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
   * Recovers microphone stream on device disconnection or track termination
   */
  private async recoverMicrophoneStream() {
    try {
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
      const track = stream.getAudioTracks()[0];
      if (track) {
        track.enabled = !this.isMuted;
        track.onended = () => this.recoverMicrophoneStream();

        // Hot-replace track across all senders without renegotiation
        for (const peer of this.peersBySocketId.values()) {
          const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
          if (sender) {
            sender.replaceTrack(track).catch(() => {});
          }
        }

        // Reconnect analyzer
        this.setupAudioAnalysis(stream);
        this.logVoice('Seamlessly recovered microphone on audio device change.');
      }
    } catch (e) {
      console.warn('[STATIC Voice] Unable to recover microphone automatically:', e);
    }
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
   * Real-time Voice Activity Detection (VAD) with hysteresis and fast attack / smooth release.
   * Does NOT alter the transmitted microphone stream.
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
      this.analyser.smoothingTimeConstant = 0.3; // Low latency envelope
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);

      // Hysteresis thresholds for natural, non-flickering speaking indicator
      const TALK_START_THRESHOLD = 0.10;
      const TALK_STOP_THRESHOLD = 0.05;

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

        if (normalized >= TALK_START_THRESHOLD) {
          // Fast attack: immediate transition to speaking
          if (!this.isSpeaking) {
            this.setSpeaking(true);
          }
          if (this.speechDebounceTimer) {
            clearTimeout(this.speechDebounceTimer);
            this.speechDebounceTimer = null;
          }
        } else if (normalized < TALK_STOP_THRESHOLD && this.isSpeaking) {
          // Smooth release: hold for 350ms before releasing speaking indicator
          if (!this.speechDebounceTimer) {
            this.speechDebounceTimer = setTimeout(() => {
              this.setSpeaking(false);
              this.speechDebounceTimer = null;
            }, 350);
          }
        }

        this.animationFrameId = requestAnimationFrame(checkVolume);
      };

      this.animationFrameId = requestAnimationFrame(checkVolume);
    } catch (e) {
      console.warn('[STATIC Voice] Audio analysis not supported:', e);
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
   * Prioritizes Opus codec on transceivers and configures optimal speech bitrate
   */
  private configureTransceiverCodecAndBitrate(pc: RTCPeerConnection, transceiver: RTCRtpTransceiver) {
    // 1. Prioritize Opus codec if supported
    if (typeof RTCRtpSender.getCapabilities === 'function') {
      const caps = RTCRtpSender.getCapabilities('audio');
      if (caps && caps.codecs) {
        const opusCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
        const nonOpus = caps.codecs.filter((c) => c.mimeType.toLowerCase() !== 'audio/opus');
        if (opusCodecs.length > 0 && typeof transceiver.setCodecPreferences === 'function') {
          try {
            transceiver.setCodecPreferences([...opusCodecs, ...nonOpus]);
          } catch (_) {}
        }
      }
    }

    // 2. Set optimal speech bitrate (40 kbps Opus) with high network priority
    try {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = 40000;
          params.encodings[0].networkPriority = 'high';
          sender.setParameters(params).catch(() => {});
        }
      }
    } catch (_) {}
  }

  /**
   * Synchronizes local microphone track directly to peer's audio transceiver
   */
  private syncLocalTrackToPeer(peer: PeerSession) {
    const pc = peer.pc;
    if (!this.localStream) return;

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack || audioTrack.readyState !== 'live') return;

    const transceivers = pc.getTransceivers();
    const audioTransceiver = transceivers.find(
      (t) =>
        (t.sender.track && t.sender.track.kind === 'audio') ||
        (t.receiver.track && t.receiver.track.kind === 'audio')
    );

    if (audioTransceiver) {
      if (audioTransceiver.direction !== 'sendrecv') {
        audioTransceiver.direction = 'sendrecv';
      }
      if (audioTransceiver.sender.track?.id !== audioTrack.id) {
        audioTransceiver.sender.replaceTrack(audioTrack).catch((err) => {
          console.warn('[STATIC Voice] replaceTrack warning:', err);
        });
      }
      this.configureTransceiverCodecAndBitrate(pc, audioTransceiver);
    } else {
      try {
        const sender = pc.addTrack(audioTrack, this.localStream);
        const addedTransceiver = pc.getTransceivers().find((t) => t.sender === sender);
        if (addedTransceiver) {
          this.configureTransceiverCodecAndBitrate(pc, addedTransceiver);
        }
      } catch (e) {
        console.warn('[STATIC Voice] addTrack warning:', e);
      }
    }
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

    this.logVoice('peer created', { remoteSocketId, remoteParticipantId });

    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all', // direct P2P preferred, TURN relay fallback
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    // Symmetric politeness: compare socket IDs
    const localSocketId = getSocket().id || '';
    const isPolite = localSocketId > remoteSocketId;

    const session: PeerSession = {
      remoteSocketId,
      remoteParticipantId,
      pc,
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

    // ICE Candidate Gathering
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('signal-peer', {
          targetSocketId: remoteSocketId,
          targetParticipantId: session.remoteParticipantId,
          signal: event.candidate.toJSON(),
          type: 'ice-candidate'
        });
      } else {
        this.logVoice('ICE gathering complete for peer', { remoteSocketId });
      }
    };

    // Remote Audio Track Handling via Centralized RemoteAudioManager
    pc.ontrack = (event) => {
      const participantId = session.remoteParticipantId || remoteSocketId;
      this.logVoice('remote track received', {
        participantId,
        remoteSocketId,
        trackId: event.track.id,
        kind: event.track.kind,
        readyState: event.track.readyState
      });

      const remoteStream =
        event.streams && event.streams[0]
          ? event.streams[0]
          : new MediaStream([event.track]);

      this.remoteAudioManager.attachRemoteStream(participantId, remoteStream);
    };

    // Connection State Monitoring & Automatic ICE Reconnection
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.logVoice(`Connection state for peer ${remoteSocketId}: ${state}`);
      this.callbacks.onConnectionStateChange?.(remoteSocketId, state);

      if (state === 'connected') {
        this.logVoice('ICE connected', { remoteSocketId });
        if (session.iceRestartTimeout) {
          clearTimeout(session.iceRestartTimeout);
          session.iceRestartTimeout = undefined;
        }
      } else if (state === 'disconnected') {
        this.logVoice('ICE disconnected (temporary network blip)', { remoteSocketId });
        // Attempt ICE restart if disconnected for more than 2.5 seconds
        if (!session.iceRestartTimeout) {
          session.iceRestartTimeout = setTimeout(() => {
            session.iceRestartTimeout = undefined;
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              this.initiateIceRestart(session);
            }
          }, 2500);
        }
      } else if (state === 'failed') {
        this.logVoice('Connection failed. Initiating automatic ICE restart...', { remoteSocketId });
        this.initiateIceRestart(session);
      }
    };

    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      if (iceState === 'failed') {
        this.initiateIceRestart(session);
      }
    };

    return session;
  }

  /**
   * Triggers seamless WebRTC ICE restart for automatic network recovery
   */
  private initiateIceRestart(session: PeerSession) {
    if (session.pc.connectionState === 'closed') return;
    this.logVoice('ICE reconnecting', { peer: session.remoteSocketId });

    try {
      if (typeof session.pc.restartIce === 'function') {
        session.pc.restartIce();
      }
      this.createOffer(session.remoteSocketId, session.remoteParticipantId, true);
    } catch (e) {
      console.warn('[STATIC Voice] restartIce error:', e);
    }
  }

  /**
   * Initiates an SDP offer with W3C Perfect Negotiation glare guarding
   */
  public async createOffer(targetSocketId: string, targetParticipantId?: string, isIceRestart: boolean = false) {
    if (!this.localStream && this.micStartingPromise) {
      await this.micStartingPromise;
    }

    const peer = this.getOrCreatePeer(targetSocketId, targetParticipantId);
    const pc = peer.pc;

    try {
      peer.makingOffer = true;
      this.syncLocalTrackToPeer(peer);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
        iceRestart: isIceRestart
      });

      if (pc.signalingState !== 'stable') {
        return;
      }

      await pc.setLocalDescription(offer);

      getSocket().emit('signal-peer', {
        targetSocketId,
        targetParticipantId: peer.remoteParticipantId,
        signal: pc.localDescription,
        type: 'offer'
      });
      this.logVoice('Sent offer to peer', { targetSocketId, isIceRestart });
    } catch (err) {
      console.error('[STATIC Voice] Error creating offer for peer:', targetSocketId, err);
    } finally {
      peer.makingOffer = false;
    }
  }

  /**
   * Handles incoming signaling messages (offers, answers, ICE candidates)
   * with W3C Perfect Negotiation rollback and candidate queue flushing.
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
          this.logVoice('Impolite peer ignoring colliding offer', { senderSocketId });
          return;
        }

        if (offerCollision && peer.isPolite) {
          this.logVoice('Polite peer rolling back colliding offer', { senderSocketId });
          await pc.setLocalDescription({ type: 'rollback' });
        }

        // 1. Set Remote Description
        await pc.setRemoteDescription(new RTCSessionDescription(signal));

        // 2. Attach or pair local track
        if (!this.localStream && this.micStartingPromise) {
          await this.micStartingPromise;
        }
        this.syncLocalTrackToPeer(peer);

        // 3. Flush queued ICE candidates
        while (peer.pendingCandidates.length > 0) {
          const candidate = peer.pendingCandidates.shift();
          if (candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
              console.warn('[STATIC Voice] addIceCandidate error:', e);
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
        this.logVoice('Sent answer to peer', { senderSocketId });
      } else if (type === 'answer') {
        if (pc.signalingState === 'have-local-offer') {
          peer.isSettingRemoteAnswerPending = true;
          await pc.setRemoteDescription(new RTCSessionDescription(signal));
          peer.isSettingRemoteAnswerPending = false;

          while (peer.pendingCandidates.length > 0) {
            const candidate = peer.pendingCandidates.shift();
            if (candidate) {
              await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch((e) => {
                console.warn('[STATIC Voice] addIceCandidate error after answer:', e);
              });
            }
          }
          this.logVoice('Remote answer accepted', { senderSocketId });
        } else {
          console.warn('[STATIC Voice] Received answer in unexpected state:', pc.signalingState);
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
            console.warn('[STATIC Voice] Error adding candidate:', err);
          }
        }
      }
    } catch (err) {
      console.error('[STATIC Voice] Signaling error for peer:', senderSocketId, err);
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

    this.logVoice('peer disconnected', {
      remoteSocketId: peer.remoteSocketId,
      remoteParticipantId: peer.remoteParticipantId
    });

    if (peer.iceRestartTimeout) {
      clearTimeout(peer.iceRestartTimeout);
      peer.iceRestartTimeout = undefined;
    }

    peer.pc.close();

    const participantId = peer.remoteParticipantId || peer.remoteSocketId;
    this.remoteAudioManager.removeParticipant(participantId);
    this.diagnostics.removePeer(participantId);

    this.peersBySocketId.delete(peer.remoteSocketId);
    if (peer.remoteParticipantId) {
      this.peersByParticipantId.delete(peer.remoteParticipantId);
    }
  }

  /**
   * Registers persistent event listeners across user interaction types
   * so that any tap, touch, or click immediately unlocks audio playback.
   */
  private registerGlobalUnlockListeners() {
    if (this.globalUnlockListenerBound || typeof window === 'undefined') return;
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
   * Registers audio device change and network recovery event listeners
   */
  private registerDeviceAndNetworkListeners() {
    if (typeof window === 'undefined') return;

    // 1. Audio Device Change (Bluetooth connects/disconnects, headphones plugged/unplugged)
    if (!this.deviceChangeListenerBound && navigator.mediaDevices) {
      this.deviceChangeListenerBound = true;
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        this.logVoice('audio device changed');
        if (this.localStream) {
          const track = this.localStream.getAudioTracks()[0];
          // If track died or became unlive, seamlessly hot-swap track
          if (!track || track.readyState !== 'live') {
            await this.recoverMicrophoneStream();
          }
        }
      });
    }

    // 2. Network Online Event (Wi-Fi to Mobile data switch recovery)
    if (!this.onlineListenerBound) {
      this.onlineListenerBound = true;
      window.addEventListener('online', () => {
        this.logVoice('Network online event detected. Checking peer connectivity...');
        for (const peer of this.peersBySocketId.values()) {
          if (peer.pc.connectionState === 'disconnected' || peer.pc.connectionState === 'failed') {
            this.initiateIceRestart(peer);
          }
        }
      });
    }
  }

  /**
   * Starts periodic WebRTC getStats() diagnostics polling
   */
  private startDiagnosticsPolling() {
    this.diagnostics.start(() => {
      const list: Array<{ id: string; socketId: string; pc: RTCPeerConnection }> = [];
      for (const peer of this.peersBySocketId.values()) {
        list.push({
          id: peer.remoteParticipantId || peer.remoteSocketId,
          socketId: peer.remoteSocketId,
          pc: peer.pc
        });
      }
      return list;
    }, 2500);
  }

  /**
   * Unlocks WebRTC audio playback under user gesture
   */
  public async unlockAudio(): Promise<boolean> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }
    return this.remoteAudioManager.unlockAll();
  }

  /**
   * Returns current diagnostics snapshot for developer diagnostics HUD
   */
  public getDiagnosticsSnapshot(): Map<string, PeerConnectionStats> {
    return this.diagnostics.getAllStats();
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
    socket.on('participant-left-party', (payload: any) => {
      const pId = typeof payload === 'string' ? payload : payload?.participantId;
      if (pId) {
        this.removePeer(pId);
      }
    });
  }

  /**
   * Fully tears down engine, audio streams, and connections
   */
  public teardown() {
    this.logVoice('engine teardown — cleaning all peers and audio elements');

    this.diagnostics.stop();

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
    }

    this.peersBySocketId.clear();
    this.peersByParticipantId.clear();

    this.remoteAudioManager.cleanup();

    this.isSpeaking = false;
    this.isMuted = false;
    this.micStartingPromise = null;
  }
}

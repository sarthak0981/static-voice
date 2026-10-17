import { getSocket } from './socket.js';
import { MicrophoneState, SignalData } from '../types/index.js';
import { RemoteAudioManager } from './remoteAudioManager.js';
import { WebRTCDiagnostics, ConnectionQuality, PeerConnectionStats, AdaptiveQualityTier } from './webrtcDiagnostics.js';
import { mungeOpusSdp } from './sdp.js';
import { noiseSuppressionController } from './noiseSuppression.js';

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
  restartAttempts: number;
}

export class WebRTCVoiceEngine {
  private localStream: MediaStream | null = null;
  private rawMicrophoneStream: MediaStream | null = null;
  private suppressionCleanup: (() => void) | null = null;
  private micStartingPromise: Promise<MediaStream | null> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  // Track peers by socketId and participantId for symmetric lookup
  private peersBySocketId: Map<string, PeerSession> = new Map();
  private peersByParticipantId: Map<string, PeerSession> = new Map();

  // Centralized Audio Manager for all remote streams
  private remoteAudioManager: RemoteAudioManager;

  // Real-time diagnostics & adaptive controller
  private diagnostics: WebRTCDiagnostics;

  // Dynamic ICE server list (STUN + server-provided TURN)
  private iceServers: RTCIceServer[] = DEFAULT_STUN_SERVERS;
  private iceConfigFetchedAt: number = 0;

  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private speechDebounceTimer: NodeJS.Timeout | null = null;
  private callbacks: WebRTCVoiceEngineCallbacks;

  // Event listener registration guards
  private globalUnlockListenerBound: boolean = false;
  private deviceChangeListenerBound: boolean = false;
  private onlineListenerBound: boolean = false;
  private visibilityListenerBound: boolean = false;
  private connectionChangeListenerBound: boolean = false;

  // Speaking emission throttle (<= 10/s)
  private lastSpeakingEmitTime: number = 0;
  private pendingSpeakingEmit: boolean | null = null;
  private speakingThrottleTimer: NodeJS.Timeout | null = null;

  // Current global target bitrate for new senders (default 48k)
  private currentAdaptiveBitrateBps: number = 48000;

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

    // Initialize diagnostics with adaptive controller
    this.diagnostics = new WebRTCDiagnostics({
      onQualityChanged: (peerId, quality) => {
        this.callbacks.onPeerQualityChange?.(peerId, quality);
      },
      onStatsUpdated: (stats) => {
        this.callbacks.onDiagnosticsUpdate?.(stats);
      },
      onAdaptiveTierChanged: (peerId, tier, targetBitrateBps, recommendedJitterBufferMs) => {
        this.handleAdaptiveTierChange(peerId, tier, targetBitrateBps, recommendedJitterBufferMs);
      }
    });

    this.fetchIceConfiguration();
    this.setupSocketListeners();
    this.registerGlobalUnlockListeners();
    this.registerDeviceAndNetworkListeners();
    this.startDiagnosticsPolling();
  }

  private logVoice(event: string, details?: any) {
    if (details !== undefined) {
      console.log(`[STATIC Voice] ${event}`, details);
    } else {
      console.log(`[STATIC Voice] ${event}`);
    }
  }

  /**
   * Lazily gets or initializes a single shared AudioContext at 48kHz with interactive latency.
   */
  private getOrCreateAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;

    if (!this.audioContext || this.audioContext.state === 'closed') {
      try {
        this.audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'interactive' });
      } catch (_) {
        this.audioContext = new AudioCtx();
      }
    }
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    return this.audioContext;
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
            this.iceConfigFetchedAt = Date.now();
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
          this.iceConfigFetchedAt = Date.now();
          this.logVoice('Loaded dynamic ICE servers from HTTP', { count: this.iceServers.length });
        }
      }
    } catch (_) {
      // Fallback stays as DEFAULT_STUN_SERVERS
    }
  }

  /**
   * Adaptive tier change handler from diagnostics controller
   */
  private handleAdaptiveTierChange(
    peerId: string,
    tier: AdaptiveQualityTier,
    targetBitrateBps: number,
    recommendedJitterBufferMs: number
  ) {
    this.currentAdaptiveBitrateBps = targetBitrateBps;
    this.logVoice(`Adaptive quality transition for ${peerId}`, {
      tier,
      targetBitrateBps,
      recommendedJitterBufferMs
    });

    const peer = this.peersByParticipantId.get(peerId) || this.peersBySocketId.get(peerId);
    if (!peer || peer.pc.connectionState === 'closed') return;

    // 1. Update sender bitrate via RTCRtpSender.setParameters()
    try {
      const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = targetBitrateBps;
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          sender.setParameters(params).catch(() => {});
        }
      }
    } catch (_) {}

    // 2. Adjust receiver jitter buffer target to minimize latency on GOOD or prevent glitches on POOR
    try {
      const receivers = peer.pc.getReceivers().filter((r) => r.track && r.track.kind === 'audio');
      for (const receiver of receivers) {
        this.setReceiverJitterBuffer(receiver, recommendedJitterBufferMs / 1000);
      }
    } catch (_) {}
  }

  private setReceiverJitterBuffer(receiver: RTCRtpReceiver, delaySeconds: number) {
    try {
      if ('jitterBufferTarget' in receiver) {
        (receiver as any).jitterBufferTarget = delaySeconds;
      } else if ('playoutDelayHint' in receiver) {
        (receiver as any).playoutDelayHint = delaySeconds;
      }
    } catch (_) {}
  }

  public setPeerVolume(id: string, volume: number): void {
    const peer = this.peersBySocketId.get(id) || this.peersByParticipantId.get(id);
    const participantId = peer?.remoteParticipantId || id;
    this.remoteAudioManager.setPeerVolume(participantId, volume);
  }

  public getPeerVolume(id: string): number {
    const peer = this.peersBySocketId.get(id) || this.peersByParticipantId.get(id);
    const participantId = peer?.remoteParticipantId || id;
    return this.remoteAudioManager.getPeerVolume(participantId);
  }

  public setPeerMuted(id: string, muted: boolean): void {
    const peer = this.peersBySocketId.get(id) || this.peersByParticipantId.get(id);
    const participantId = peer?.remoteParticipantId || id;
    this.remoteAudioManager.setPeerMuted(participantId, muted);
  }

  public isPeerMuted(id: string): boolean {
    const peer = this.peersBySocketId.get(id) || this.peersByParticipantId.get(id);
    const participantId = peer?.remoteParticipantId || id;
    return this.remoteAudioManager.isPeerMuted(participantId);
  }

  public setMasterVolume(volume: number): void {
    this.remoteAudioManager.setMasterVolume(volume);
  }

  public getMasterVolume(): number {
    return this.remoteAudioManager.getMasterVolume();
  }

  /**
   * Initializes local microphone stream with 48 kHz mono native processing & speech content hint.
   * Uses ideal constraints with graceful OverconstrainedError fallback.
   */
  public async startMicrophone(startMuted: boolean = true): Promise<boolean> {
    if (
      this.localStream &&
      this.localStream.active &&
      this.localStream.getAudioTracks().some((t) => t.readyState === 'live')
    ) {
      if (startMuted) {
        this.isMuted = true;
      }
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !this.isMuted;
      });

      const state: MicrophoneState = this.isMuted ? 'MUTED' : 'ON';
      this.callbacks.onMicrophoneStateChange(state);
      getSocket().emit('update-mic-state', { microphoneState: state });

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

        // Request exact constraints with ideal targets
        const idealConstraints: MediaStreamConstraints = {
          audio: {
            channelCount: { ideal: 1 },
            sampleRate: { ideal: 48000 },
            sampleSize: { ideal: 16 },
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: true },
            autoGainControl: { ideal: true },
            latency: { ideal: 0 }
          } as MediaTrackConstraints,
          video: false
        };

        let rawStream: MediaStream;
        try {
          rawStream = await navigator.mediaDevices.getUserMedia(idealConstraints);
        } catch (constraintErr: any) {
          if (constraintErr.name === 'OverconstrainedError') {
            this.logVoice('OverconstrainedError encountered; falling back to standard audio constraints');
            rawStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
          } else {
            throw constraintErr;
          }
        }

        this.rawMicrophoneStream = rawStream;
        const rawTrack = rawStream.getAudioTracks()[0];
        if (rawTrack && 'contentHint' in rawTrack) {
          rawTrack.contentHint = 'speech';
        }

        // Process through noise suppression worklet (with graceful bypass)
        const audioCtx = this.getOrCreateAudioContext();
        let stream = rawStream;
        if (audioCtx) {
          const suppressionResult = await noiseSuppressionController.processStream(rawStream, audioCtx);
          this.suppressionCleanup = suppressionResult.cleanup;
          stream = suppressionResult.outputStream;
        }

        this.localStream = stream;
        this.isMuted = startMuted;
        stream.getAudioTracks().forEach((track) => {
          track.enabled = !this.isMuted;
          if ('contentHint' in track) {
            track.contentHint = 'speech';
          }
        });

        this.logVoice('microphone started', {
          muted: this.isMuted,
          tracks: stream.getAudioTracks().map((t) => ({
            label: t.label,
            settings: t.getSettings()
          }))
        });

        // Watch track onended for unplugged mic recovery
        const activeTrack = stream.getAudioTracks()[0] || rawTrack;
        if (activeTrack) {
          activeTrack.onended = () => {
            this.logVoice('Local audio track ended. Attempting automatic recovery...');
            this.recoverMicrophoneStream();
          };
        }

        // Real-time Voice Activity Detection (AnalyserNode with smoothed envelope)
        this.setupAudioAnalysis(stream);

        // Sync local track to all active peer connections
        for (const peer of this.peersBySocketId.values()) {
          this.syncLocalTrackToPeer(peer);
          if (peer.pc.signalingState === 'stable') {
            this.createOffer(peer.remoteSocketId, peer.remoteParticipantId);
          }
        }

        const state: MicrophoneState = this.isMuted ? 'MUTED' : 'ON';
        this.callbacks.onMicrophoneStateChange(state);
        getSocket().emit('update-mic-state', { microphoneState: state });
        return stream;
      } catch (err: any) {
        console.warn('[STATIC Voice] Microphone access error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          this.callbacks.onMicrophoneStateChange('DENIED');
          getSocket().emit('update-mic-state', { microphoneState: 'DENIED' });
          this.callbacks.onError('Microphone permission denied. Enable microphone access in browser settings.');
        } else {
          this.callbacks.onMicrophoneStateChange('OFF');
          getSocket().emit('update-mic-state', { microphoneState: 'OFF' });
          this.callbacks.onError('Microphone unavailable. Please check your audio input device.');
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
   * Replaces tracks across all senders without renegotiation.
   */
  private async recoverMicrophoneStream() {
    try {
      if (this.suppressionCleanup) {
        this.suppressionCleanup();
        this.suppressionCleanup = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 48000 },
          sampleSize: { ideal: 16 },
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          latency: { ideal: 0 }
        } as MediaTrackConstraints,
        video: false
      });

      this.rawMicrophoneStream = stream;
      let finalStream = stream;

      const audioCtx = this.getOrCreateAudioContext();
      if (audioCtx) {
        const suppressionResult = await noiseSuppressionController.processStream(stream, audioCtx);
        this.suppressionCleanup = suppressionResult.cleanup;
        finalStream = suppressionResult.outputStream;
      }

      this.localStream = finalStream;
      const track = finalStream.getAudioTracks()[0];
      if (track) {
        track.enabled = !this.isMuted;
        if ('contentHint' in track) {
          track.contentHint = 'speech';
        }
        track.onended = () => this.recoverMicrophoneStream();

        // Hot-replace track across all peer senders without renegotiation
        for (const peer of this.peersBySocketId.values()) {
          const sender = peer.pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
          if (sender) {
            sender.replaceTrack(track).catch(() => {});
          }
        }

        // Reconnect audio analyzer
        this.setupAudioAnalysis(finalStream);
        this.logVoice('Seamlessly recovered microphone on audio device change.');
      }
    } catch (e: any) {
      console.warn('[STATIC Voice] Unable to recover microphone automatically:', e);
      if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
        this.callbacks.onMicrophoneStateChange('DENIED');
        getSocket().emit('update-mic-state', { microphoneState: 'DENIED' });
      } else {
        this.callbacks.onMicrophoneStateChange('OFF');
        getSocket().emit('update-mic-state', { microphoneState: 'OFF' });
      }
    }
  }

  public toggleMute(): boolean {
    if (!this.localStream) return false;

    const audioTracks = this.localStream.getAudioTracks();
    if (audioTracks.length === 0) return false;

    this.isMuted = !this.isMuted;
    audioTracks.forEach((track) => {
      track.enabled = !this.isMuted;
    });

    if (!this.isMuted) {
      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {});
      }
      this.remoteAudioManager.unlockAll();
    }

    const newState: MicrophoneState = this.isMuted ? 'MUTED' : 'ON';
    this.callbacks.onMicrophoneStateChange(newState);
    getSocket().emit('update-mic-state', { microphoneState: newState });

    if (this.isMuted) {
      this.setSpeaking(false);
    }

    return this.isMuted;
  }

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
   * Real-time Voice Activity Detection with smoothed envelope and speaking hysteresis.
   */
  private setupAudioAnalysis(stream: MediaStream) {
    try {
      const audioCtx = this.getOrCreateAudioContext();
      if (!audioCtx) return;

      const source = audioCtx.createMediaStreamSource(stream);
      this.analyser = audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.3; // Low latency envelope
      source.connect(this.analyser);

      const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
      const TALK_START_THRESHOLD = 0.10;
      const TALK_STOP_THRESHOLD = 0.05;

      const checkVolume = () => {
        if (!this.analyser) return;

        // Pause rAF loop when tab is in background to conserve CPU/battery
        if (typeof document !== 'undefined' && document.hidden) {
          return;
        }

        if (this.isMuted) {
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
          if (!this.isSpeaking) {
            this.setSpeaking(true);
          }
          if (this.speechDebounceTimer) {
            clearTimeout(this.speechDebounceTimer);
            this.speechDebounceTimer = null;
          }
        } else if (normalized < TALK_STOP_THRESHOLD && this.isSpeaking) {
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

      // Resume checkVolume loop immediately when tab becomes visible
      if (typeof document !== 'undefined') {
        const onVisibilityResume = () => {
          if (!document.hidden && this.analyser) {
            if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = requestAnimationFrame(checkVolume);
          }
        };
        document.addEventListener('visibilitychange', onVisibilityResume);
      }
    } catch (e) {
      console.warn('[STATIC Voice] Audio analysis setup error:', e);
    }
  }

  /**
   * Rate-limited speaking indicator emission (<= 10/s)
   */
  private setSpeaking(speaking: boolean) {
    if (this.isSpeaking !== speaking) {
      this.isSpeaking = speaking;
      this.callbacks.onSpeakingChange(speaking);

      const now = Date.now();
      const elapsed = now - this.lastSpeakingEmitTime;
      if (elapsed >= 100) {
        this.lastSpeakingEmitTime = now;
        getSocket().emit('update-speaking', { isSpeaking: speaking });
      } else {
        this.pendingSpeakingEmit = speaking;
        if (!this.speakingThrottleTimer) {
          this.speakingThrottleTimer = setTimeout(() => {
            this.speakingThrottleTimer = null;
            this.lastSpeakingEmitTime = Date.now();
            if (this.pendingSpeakingEmit !== null) {
              getSocket().emit('update-speaking', { isSpeaking: this.pendingSpeakingEmit });
              this.pendingSpeakingEmit = null;
            }
          }, 100 - elapsed);
        }
      }
    }
  }

  /**
   * Prioritizes Opus and Opus RED (redundant audio), sets degradationPreference and network priorities.
   */
  private configureTransceiverCodecAndBitrate(
    pc: RTCPeerConnection,
    transceiver: RTCRtpTransceiver,
    targetBitrateBps: number = this.currentAdaptiveBitrateBps
  ) {
    // 1. Prioritize Opus RED (redundant audio for loss resilience) then Opus
    if (typeof RTCRtpSender.getCapabilities === 'function') {
      const caps = RTCRtpSender.getCapabilities('audio');
      if (caps && caps.codecs) {
        const redCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/red');
        const opusCodecs = caps.codecs.filter((c) => c.mimeType.toLowerCase() === 'audio/opus');
        const remaining = caps.codecs.filter(
          (c) => c.mimeType.toLowerCase() !== 'audio/red' && c.mimeType.toLowerCase() !== 'audio/opus'
        );

        if (typeof transceiver.setCodecPreferences === 'function') {
          try {
            if (redCodecs.length > 0 && opusCodecs.length > 0) {
              transceiver.setCodecPreferences([...redCodecs, ...opusCodecs, ...remaining]);
            } else if (opusCodecs.length > 0) {
              transceiver.setCodecPreferences([...opusCodecs, ...remaining]);
            }
          } catch (_) {}
        }
      }
    }

    // 2. Set adaptive speech bitrate with high network priority & degradation preference
    try {
      const sender = pc.getSenders().find((s) => s.track && s.track.kind === 'audio');
      if (sender) {
        const params = sender.getParameters();
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = targetBitrateBps;
          params.encodings[0].priority = 'high';
          params.encodings[0].networkPriority = 'high';
          if ('degradationPreference' in params) {
            (params as any).degradationPreference = 'maintain-framerate';
          }
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
   * Retrieves or creates a PeerSession with W3C Perfect Negotiation state & resilient config
   */
  private getOrCreatePeer(remoteSocketId: string, remoteParticipantId?: string): PeerSession {
    let existing = this.peersBySocketId.get(remoteSocketId);
    if (!existing && remoteParticipantId) {
      existing = this.peersByParticipantId.get(remoteParticipantId);
      if (existing) {
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

    // Resilient connection config (max-bundle, require rtcp-mux, iceCandidatePoolSize: 4)
    const pc = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      iceCandidatePoolSize: 4
    });

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
      isPolite,
      restartAttempts: 0
    };

    this.peersBySocketId.set(remoteSocketId, session);
    if (remoteParticipantId) {
      this.peersByParticipantId.set(remoteParticipantId, session);
    }

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

    // Remote Audio Track Handling & Low-Latency Playout
    pc.ontrack = (event) => {
      const participantId = session.remoteParticipantId || remoteSocketId;
      this.logVoice('remote track received', {
        participantId,
        remoteSocketId,
        trackId: event.track.id,
        kind: event.track.kind
      });

      // Low latency playout target (30ms for GOOD)
      if (event.receiver) {
        this.setReceiverJitterBuffer(event.receiver, 0.03);
      }

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
        session.restartAttempts = 0;
        if (session.iceRestartTimeout) {
          clearTimeout(session.iceRestartTimeout);
          session.iceRestartTimeout = undefined;
        }
      } else if (state === 'disconnected') {
        this.logVoice('ICE disconnected (3s debounce countdown)', { remoteSocketId });
        if (!session.iceRestartTimeout) {
          session.iceRestartTimeout = setTimeout(() => {
            session.iceRestartTimeout = undefined;
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
              this.initiateIceRestart(session);
            }
          }, 3000);
        }
      } else if (state === 'failed') {
        this.logVoice('Connection failed. Initiating immediate ICE restart...', { remoteSocketId });
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
   * Triggers WebRTC ICE restart with exponential backoff & jitter
   */
  private initiateIceRestart(session: PeerSession) {
    if (session.pc.connectionState === 'closed') return;
    session.restartAttempts = (session.restartAttempts || 0) + 1;
    this.logVoice('ICE reconnecting', { peer: session.remoteSocketId, attempt: session.restartAttempts });

    // Re-fetch credentials if nearing expiry (> 45 minutes)
    if (Date.now() - this.iceConfigFetchedAt > 45 * 60 * 1000) {
      this.fetchIceConfiguration().catch(() => {});
    }

    if (session.restartAttempts > 3) {
      this.logVoice('Max ICE restart attempts exceeded for peer. Re-requesting discovery...', {
        peer: session.remoteSocketId
      });
      session.restartAttempts = 0;
      const targetId = session.remoteParticipantId;
      const targetSocket = session.remoteSocketId;
      this.removePeer(targetSocket);
      if (targetId) {
        getSocket().emit('peer-ready-for-offer', { socketId: targetSocket, participantId: targetId });
      }
      return;
    }

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
   * Initiates an SDP offer with W3C Perfect Negotiation & pure Opus SDP munging
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

      // Munge Opus parameters into offer SDP
      const mungedOfferSdp = mungeOpusSdp(offer.sdp || '', {
        maxaveragebitrate: this.currentAdaptiveBitrateBps,
        ptime: 20,
        minptime: 10,
        useinbandfec: true,
        usedtx: true
      });

      const mungedOffer = new RTCSessionDescription({ type: 'offer', sdp: mungedOfferSdp });
      await pc.setLocalDescription(mungedOffer);

      getSocket().emit('signal-peer', {
        targetSocketId,
        targetParticipantId: peer.remoteParticipantId,
        signal: pc.localDescription,
        type: 'offer'
      });
      this.logVoice('Sent munged offer to peer', { targetSocketId, isIceRestart });
    } catch (err) {
      console.error('[STATIC Voice] Error creating offer for peer:', targetSocketId, err);
    } finally {
      peer.makingOffer = false;
    }
  }

  /**
   * Handles incoming signaling messages (offers, answers, ICE candidates)
   * with W3C Perfect Negotiation, pure Opus answer munging, and candidate queue flushing.
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

        // 4. Create, munge, and set answer
        const answer = await pc.createAnswer();
        const mungedAnswerSdp = mungeOpusSdp(answer.sdp || '', {
          maxaveragebitrate: this.currentAdaptiveBitrateBps,
          ptime: 20,
          minptime: 10,
          useinbandfec: true,
          usedtx: true
        });

        const mungedAnswer = new RTCSessionDescription({ type: 'answer', sdp: mungedAnswerSdp });
        await pc.setLocalDescription(mungedAnswer);

        // 5. Emit Answer
        getSocket().emit('signal-peer', {
          targetSocketId: senderSocketId,
          targetParticipantId: peer.remoteParticipantId,
          signal: pc.localDescription,
          type: 'answer'
        });
        this.logVoice('Sent munged answer to peer', { senderSocketId });
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
   * Registers audio device change, network recovery, and visibility event listeners
   */
  private registerDeviceAndNetworkListeners() {
    if (typeof window === 'undefined') return;

    // 1. Audio Device Change (Headphones/Bluetooth plugged or route changed)
    if (!this.deviceChangeListenerBound && navigator.mediaDevices) {
      this.deviceChangeListenerBound = true;
      navigator.mediaDevices.addEventListener('devicechange', async () => {
        this.logVoice('audio device changed');
        if (this.localStream) {
          const track = this.localStream.getAudioTracks()[0];
          if (!track || track.readyState !== 'live') {
            await this.recoverMicrophoneStream();
          }
        }
        this.remoteAudioManager.unlockAll();
      });
    }

    // 2. Network Online Event (Wi-Fi to Mobile data recovery)
    if (!this.onlineListenerBound) {
      this.onlineListenerBound = true;
      window.addEventListener('online', () => {
        this.logVoice('Network online event detected. Proactively checking peer connectivity...');
        for (const peer of this.peersBySocketId.values()) {
          if (peer.pc.connectionState === 'disconnected' || peer.pc.connectionState === 'failed') {
            this.initiateIceRestart(peer);
          }
        }
      });
    }

    // 3. Tab Visibility Change (iOS Safari / mobile wake from background)
    if (!this.visibilityListenerBound) {
      this.visibilityListenerBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          this.logVoice('Tab resumed to foreground. Verifying audio state and connectivity...');
          this.unlockAudio();
          for (const peer of this.peersBySocketId.values()) {
            if (peer.pc.iceConnectionState === 'disconnected' || peer.pc.iceConnectionState === 'failed') {
              this.initiateIceRestart(peer);
            }
          }
        }
      });
    }

    // 4. Network Connection Type Change
    if (!this.connectionChangeListenerBound && (navigator as any).connection) {
      this.connectionChangeListenerBound = true;
      (navigator as any).connection.addEventListener('change', () => {
        this.logVoice('Network interface change detected (e.g. WiFi <-> Cellular). Proactively verifying ICE...');
        for (const peer of this.peersBySocketId.values()) {
          if (peer.pc.connectionState === 'connected' || peer.pc.connectionState === 'disconnected') {
            this.initiateIceRestart(peer);
          }
        }
      });
    }
  }

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
    }, 2000); // 2000ms periodic adaptive polling
  }

  public async unlockAudio(): Promise<boolean> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch(() => {});
    }
    return this.remoteAudioManager.unlockAll();
  }

  public getDiagnosticsSnapshot(): Map<string, PeerConnectionStats> {
    return this.diagnostics.getAllStats();
  }

  private onSignalReceivedHandler = async (data: SignalData) => {
    await this.handleSignalReceived(data);
  };

  private onPeerReadyHandler = async ({ socketId, participantId }: any) => {
    await this.createOffer(socketId, participantId);
  };

  private onParticipantLeftHandler = (payload: any) => {
    const pId = typeof payload === 'string' ? payload : payload?.participantId;
    if (pId) this.removePeer(pId);
  };

  private onParticipantDisconnectedHandler = (payload: any) => {
    const pId = typeof payload === 'string' ? payload : payload?.participantId;
    if (pId) this.removePeer(pId);
  };

  private onParticipantKickedHandler = (payload: any) => {
    const pId = typeof payload === 'string' ? payload : payload?.participantId;
    if (pId) this.removePeer(pId);
  };

  private setupSocketListeners() {
    const socket = getSocket();
    socket.on('signal-received', this.onSignalReceivedHandler);
    socket.on('peer-ready-for-offer', this.onPeerReadyHandler);
    socket.on('participant-left-party', this.onParticipantLeftHandler);
    socket.on('participant-disconnected', this.onParticipantDisconnectedHandler);
    socket.on('participant-kicked', this.onParticipantKickedHandler);
  }

  /**
   * Fully tears down engine, audio streams, and connections.
   * Guarantees zero leaking RTCPeerConnections, AudioContexts, or intervals.
   */
  public teardown() {
    this.logVoice('engine teardown — cleaning all peers, tracks, and listeners');

    this.diagnostics.stop();

    const socket = getSocket();
    socket.off('signal-received', this.onSignalReceivedHandler);
    socket.off('peer-ready-for-offer', this.onPeerReadyHandler);
    socket.off('participant-left-party', this.onParticipantLeftHandler);
    socket.off('participant-disconnected', this.onParticipantDisconnectedHandler);
    socket.off('participant-kicked', this.onParticipantKickedHandler);

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    if (this.speechDebounceTimer) {
      clearTimeout(this.speechDebounceTimer);
      this.speechDebounceTimer = null;
    }
    if (this.speakingThrottleTimer) {
      clearTimeout(this.speakingThrottleTimer);
      this.speakingThrottleTimer = null;
    }

    if (this.suppressionCleanup) {
      this.suppressionCleanup();
      this.suppressionCleanup = null;
    }

    if (this.rawMicrophoneStream) {
      this.rawMicrophoneStream.getTracks().forEach((t) => t.stop());
      this.rawMicrophoneStream = null;
    }

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.enabled = false;
        track.stop();
      });
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

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteAudioManager(): RemoteAudioManager {
    return this.remoteAudioManager;
  }
}

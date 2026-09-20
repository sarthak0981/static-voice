import { getSocket } from './socket.js';
import { MicrophoneState, SignalData } from '../types/index.js';

export interface WebRTCVoiceEngineCallbacks {
  onMicrophoneStateChange: (state: MicrophoneState) => void;
  onSpeakingChange: (isSpeaking: boolean) => void;
  onAudioLevelChange?: (level: number) => void;
  onAutoplayBlocked?: (isBlocked: boolean) => void;
  onError: (errorMessage: string) => void;
}

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export class WebRTCVoiceEngine {
  private localStream: MediaStream | null = null;
  private micStartingPromise: Promise<MediaStream | null> | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private animationFrameId: number | null = null;

  // Map of remote socketId -> RTCPeerConnection
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  // Map of remote socketId -> queued ICE candidates before remote description set
  private pendingCandidates: Map<string, RTCIceCandidateInit[]> = new Map();
  // Map of remote socketId -> HTMLAudioElement
  private remoteAudioElements: Map<string, HTMLAudioElement> = new Map();

  private isMuted: boolean = false;
  private isSpeaking: boolean = false;
  private isAutoplayBlocked: boolean = false;
  private hasRegisteredUnlockListeners: boolean = false;
  private speechDebounceTimer: NodeJS.Timeout | null = null;
  private callbacks: WebRTCVoiceEngineCallbacks;

  constructor(callbacks: WebRTCVoiceEngineCallbacks) {
    this.callbacks = callbacks;
    this.setupSocketListeners();
  }

  /**
   * Initializes local microphone stream and audio analysis
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

        // Request actual microphone with modern noise suppression & echo cancellation
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

        // Setup Web Audio API for real-time speech detection
        this.setupAudioAnalysis(stream);

        // Add local audio tracks to all existing peer connections
        for (const [peerSocketId, pc] of this.peerConnections.entries()) {
          let trackAdded = false;
          stream.getAudioTracks().forEach((track) => {
            const senders = pc.getSenders();
            const exists = senders.some((s) => s.track && s.track.id === track.id);
            if (!exists) {
              console.log('[STATIC WebRTC] Adding local audio track to peer connection:', peerSocketId);
              pc.addTrack(track, stream);
              trackAdded = true;
            }
          });
          // If the connection was already established (stable), renegotiate to transmit newly added track
          if (trackAdded && pc.signalingState === 'stable') {
            console.log('[STATIC WebRTC] Renegotiating offer after adding track for peer:', peerSocketId);
            this.createOffer(peerSocketId);
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
          this.callbacks.onError(
            "We can't access your microphone. Check your browser permissions and try again."
          );
        } else {
          this.callbacks.onMicrophoneStateChange('OFF');
          getSocket().emit('update-mic-state', { microphoneState: 'OFF' });
          this.callbacks.onError(
            'Microphone initialization failed. Please check audio devices.'
          );
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

      this.audioContext = new AudioCtx();
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
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

        // Speech threshold
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
          // Keep speaking ring active for 400ms after volume drops to prevent jitter
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
   * Ensures an invisible DOM container exists to hold remote <audio> elements.
   * On mobile Safari (WebKit) and mobile Chrome, unattached media elements are
   * prone to aggressive power-saving throttling or background pausing.
   * Mounting into the DOM guarantees persistent full-duplex playback.
   */
  private getOrCreateAudioContainer(): HTMLElement {
    let container = document.getElementById('static-remote-audio-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'static-remote-audio-container';
      container.setAttribute('aria-hidden', 'true');
      container.style.position = 'fixed';
      container.style.width = '0px';
      container.style.height = '0px';
      container.style.opacity = '0';
      container.style.pointerEvents = 'none';
      container.style.overflow = 'hidden';
      container.style.bottom = '0px';
      container.style.left = '0px';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Optimizes Opus audio parameters in SDP to match modern Discord-style voice profiles:
   * Enables In-Band Forward Error Correction (packet loss resilience on cellular/Wi-Fi),
   * Discontinuous Transmission (saves battery and bandwidth during silence),
   * sets target average bitrate to 64 kbps, and forces mono channel encoding.
   */
  private optimizeOpusSdp(sdp: string): string {
    if (!sdp) return sdp;

    const opusPayloadMatch = sdp.match(/a=rtpmap:(\d+)\s+opus\/48000/i);
    if (!opusPayloadMatch) return sdp;

    const payloadType = opusPayloadMatch[1];
    const fmtpRegex = new RegExp(`a=fmtp:${payloadType}\\s+([^\\r\\n]*)`, 'i');
    const fmtpMatch = sdp.match(fmtpRegex);

    const desiredParams = [
      'useinbandfec=1',
      'usedtx=1',
      'maxaveragebitrate=64000',
      'stereo=0'
    ];

    if (fmtpMatch) {
      const currentParams = fmtpMatch[1].split(';').map((p) => p.trim()).filter(Boolean);
      for (const desired of desiredParams) {
        const [key] = desired.split('=');
        const idx = currentParams.findIndex((p) => p.startsWith(key + '='));
        if (idx !== -1) {
          currentParams[idx] = desired;
        } else {
          currentParams.push(desired);
        }
      }
      return sdp.replace(fmtpRegex, `a=fmtp:${payloadType} ${currentParams.join('; ')}`);
    } else {
      const rtpmapLine = opusPayloadMatch[0];
      const newFmtpLine = `${rtpmapLine}\r\na=fmtp:${payloadType} ${desiredParams.join('; ')}`;
      return sdp.replace(rtpmapLine, newFmtpLine);
    }
  }

  /**
   * Initializes RTCPeerConnection with a remote peer
   */
  private getOrCreatePeerConnection(remoteSocketId: string): RTCPeerConnection {
    let pc = this.peerConnections.get(remoteSocketId);
    if (pc && pc.connectionState !== 'closed') {
      return pc;
    }

    console.log('[STATIC WebRTC] peer connection created for peer:', remoteSocketId);
    pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require'
    });

    this.peerConnections.set(remoteSocketId, pc);

    // Add local audio tracks if stream exists
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        const senders = pc!.getSenders();
        const exists = senders.some((s) => s.track && s.track.id === track.id);
        if (!exists) {
          pc!.addTrack(track, this.localStream!);
        }
      });
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        getSocket().emit('signal-peer', {
          targetSocketId: remoteSocketId,
          signal: event.candidate.toJSON(),
          type: 'ice-candidate'
        });
      }
    };

    // Handle remote audio stream
    pc.ontrack = (event) => {
      console.log('[STATIC WebRTC] remote track received for peer:', remoteSocketId, {
        kind: event.track.kind,
        readyState: event.track.readyState,
        enabled: event.track.enabled,
        muted: event.track.muted,
        id: event.track.id,
        streamId: event.streams[0]?.id,
        streamTracksCount: event.streams[0]?.getAudioTracks().length || 0
      });

      let audio = this.remoteAudioElements.get(remoteSocketId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        (audio as any).playsInline = true;
        audio.setAttribute('playsinline', 'true');
        audio.setAttribute('webkit-playsinline', 'true');
        audio.preload = 'auto';
        audio.volume = 1.0;
        // Never mute remote audio; only local microphone is muted
        audio.muted = false;

        // Prefer default loudspeaker / headset routing if supported by browser
        if (typeof (audio as any).setSinkId === 'function') {
          (audio as any).setSinkId('default').catch(() => {});
        }

        const container = this.getOrCreateAudioContainer();
        container.appendChild(audio);

        this.remoteAudioElements.set(remoteSocketId, audio);
      }

      const stream = event.streams && event.streams[0] ? event.streams[0] : new MediaStream([event.track]);
      audio.srcObject = stream;
      console.log('[STATIC WebRTC] remote stream attached for peer:', remoteSocketId);

      const attemptPlay = () => {
        console.log('[STATIC WebRTC] audio.play() attempted for peer:', remoteSocketId);
        audio!.play()
          .then(() => {
            console.log('[STATIC WebRTC] audio.play() succeeded for peer:', remoteSocketId);
            if (this.isAutoplayBlocked) {
              this.isAutoplayBlocked = false;
              this.callbacks.onAutoplayBlocked?.(false);
            }
          })
          .catch((err: any) => {
            console.warn('[STATIC WebRTC] audio.play() failed for peer:', remoteSocketId, {
              name: err.name,
              message: err.message
            });
            this.handleAutoplayFailure();
          });
      };

      attemptPlay();

      // On iOS WebKit, remote tracks can briefly arrive in muted state until RTP flow commences
      event.track.addEventListener('unmute', () => {
        console.log('[STATIC WebRTC] remote track unmuted for peer:', remoteSocketId);
        if (audio!.paused) {
          attemptPlay();
        }
      });
    };

    pc.oniceconnectionstatechange = () => {
      if (pc!.iceConnectionState === 'failed') {
        console.log('[STATIC WebRTC] ICE connection state failed, restarting ICE for peer:', remoteSocketId);
        pc!.restartIce();
      }
    };

    return pc;
  }

  /**
   * Initiates an SDP offer to a newly admitted peer
   */
  public async createOffer(targetSocketId: string) {
    try {
      // If microphone is currently starting up, wait for it so the offer contains the audio track
      if (!this.localStream && this.micStartingPromise) {
        console.log('[STATIC WebRTC] createOffer waiting for pending microphone initialization...');
        await this.micStartingPromise;
      }

      const pc = this.getOrCreatePeerConnection(targetSocketId);
      // Ensure local tracks are attached if localStream exists
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          const senders = pc.getSenders();
          const exists = senders.some((s) => s.track && s.track.id === track.id);
          if (!exists) {
            pc.addTrack(track, this.localStream!);
          }
        });
      }

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false
      });
      const optimizedSdp = this.optimizeOpusSdp(offer.sdp || '');
      await pc.setLocalDescription({ type: offer.type, sdp: optimizedSdp });

      getSocket().emit('signal-peer', {
        targetSocketId,
        signal: pc.localDescription,
        type: 'offer'
      });
    } catch (err) {
      console.warn('[STATIC WebRTC] Error creating offer:', err);
    }
  }

  /**
   * Responds to an SDP offer with an SDP answer
   */
  private async handleOffer(senderSocketId: string, offer: RTCSessionDescriptionInit) {
    try {
      // CRITICAL FIX: If local microphone is starting up, wait for it so the answer contains the audio track!
      if (!this.localStream && this.micStartingPromise) {
        console.log('[STATIC WebRTC] handleOffer waiting for pending microphone initialization before answering...');
        await this.micStartingPromise;
      } else if (!this.localStream && !this.micStartingPromise) {
        console.log('[STATIC WebRTC] handleOffer starting microphone to include audio track in answer...');
        await this.startMicrophone();
      }

      const pc = this.getOrCreatePeerConnection(senderSocketId);
      // Ensure local tracks are attached if localStream exists
      if (this.localStream) {
        this.localStream.getAudioTracks().forEach((track) => {
          const senders = pc.getSenders();
          const exists = senders.some((s) => s.track && s.track.id === track.id);
          if (!exists) {
            pc.addTrack(track, this.localStream!);
          }
        });
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Process any pending candidates
      const queued = this.pendingCandidates.get(senderSocketId) || [];
      for (const candidate of queued) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      }
      this.pendingCandidates.delete(senderSocketId);

      const answer = await pc.createAnswer();
      const optimizedSdp = this.optimizeOpusSdp(answer.sdp || '');
      await pc.setLocalDescription({ type: answer.type, sdp: optimizedSdp });

      getSocket().emit('signal-peer', {
        targetSocketId: senderSocketId,
        signal: pc.localDescription,
        type: 'answer'
      });
    } catch (err) {
      console.warn('[STATIC WebRTC] Error handling offer:', err);
    }
  }

  /**
   * Handles incoming SDP answer
   */
  private async handleAnswer(senderSocketId: string, answer: RTCSessionDescriptionInit) {
    try {
      const pc = this.peerConnections.get(senderSocketId);
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));

        const queued = this.pendingCandidates.get(senderSocketId) || [];
        for (const candidate of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.pendingCandidates.delete(senderSocketId);
      }
    } catch (err) {
      console.warn('[STATIC WebRTC] Error handling answer:', err);
    }
  }

  /**
   * Handles incoming ICE candidate
   */
  private async handleIceCandidate(senderSocketId: string, candidate: RTCIceCandidateInit) {
    try {
      const pc = this.peerConnections.get(senderSocketId);
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        // Queue candidate until remote description is set
        const list = this.pendingCandidates.get(senderSocketId) || [];
        list.push(candidate);
        this.pendingCandidates.set(senderSocketId, list);
      }
    } catch (err) {
      console.warn('[STATIC WebRTC] Error adding ICE candidate:', err);
    }
  }

  /**
   * Clean up peer connection for a participant who left
   */
  public removePeer(participantSocketId: string) {
    console.log('[STATIC WebRTC] peer disconnected for peer:', participantSocketId);
    const pc = this.peerConnections.get(participantSocketId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(participantSocketId);
    }
    const audio = this.remoteAudioElements.get(participantSocketId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
      this.remoteAudioElements.delete(participantSocketId);
    }
    this.pendingCandidates.delete(participantSocketId);
  }

  /**
   * Handles audio autoplay rejection by the browser (common in iOS Safari).
   * Notifies the UI and registers one-time touch/click listeners to unlock audio immediately on user interaction.
   */
  private handleAutoplayFailure() {
    this.isAutoplayBlocked = true;
    this.callbacks.onAutoplayBlocked?.(true);

    if (!this.hasRegisteredUnlockListeners) {
      this.hasRegisteredUnlockListeners = true;
      const onUserInteraction = async () => {
        console.log('[STATIC WebRTC] User interaction detected, unlocking blocked audio elements...');
        await this.unlockAudio();
      };

      const opts = { once: true, passive: true, capture: true };
      window.addEventListener('touchstart', onUserInteraction, opts);
      window.addEventListener('touchend', onUserInteraction, opts);
      window.addEventListener('click', onUserInteraction, opts);
      window.addEventListener('keydown', onUserInteraction, opts);
    }
  }

  /**
   * Unlocks WebRTC audio playback and AudioContext using a user gesture.
   */
  public async unlockAudio(): Promise<boolean> {
    try {
      console.log('[STATIC WebRTC] unlockAudio called (user gesture)');
      // 1. Resume AudioContext if suspended
      if (this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume().catch((e) => {
          console.warn('[STATIC WebRTC] AudioContext resume failed:', e);
        });
      }

      // 2. Play all paused remote audio elements
      let allPlaying = true;
      for (const [peerId, audio] of this.remoteAudioElements.entries()) {
        if (audio.paused) {
          console.log('[STATIC WebRTC] audio.play() attempted (unlock) for peer:', peerId);
          try {
            await audio.play();
            console.log('[STATIC WebRTC] audio.play() succeeded (unlock) for peer:', peerId);
          } catch (err: any) {
            console.warn('[STATIC WebRTC] audio.play() failed (unlock) for peer:', peerId, {
              name: err.name,
              message: err.message
            });
            allPlaying = false;
          }
        }
      }

      if (allPlaying) {
        this.isAutoplayBlocked = false;
        this.hasRegisteredUnlockListeners = false;
        this.callbacks.onAutoplayBlocked?.(false);
      }

      return allPlaying;
    } catch (err) {
      console.warn('[STATIC WebRTC] unlockAudio exception:', err);
      return false;
    }
  }

  /**
   * Setup socket event listeners for WebRTC signaling
   */
  private setupSocketListeners() {
    const socket = getSocket();

    // Signal received from another Party peer
    socket.on('signal-received', async (data: SignalData) => {
      if (data.type === 'offer') {
        await this.handleOffer(data.senderSocketId, data.signal);
      } else if (data.type === 'answer') {
        await this.handleAnswer(data.senderSocketId, data.signal);
      } else if (data.type === 'ice-candidate') {
        await this.handleIceCandidate(data.senderSocketId, data.signal);
      }
    });

    // Server instructs this peer to initiate an offer to another peer
    socket.on('peer-ready-for-offer', async ({ socketId }) => {
      await this.createOffer(socketId);
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

    this.peerConnections.forEach((pc) => pc.close());
    this.peerConnections.clear();

    this.remoteAudioElements.forEach((audio) => {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    });
    this.remoteAudioElements.clear();
    this.pendingCandidates.clear();

    const container = document.getElementById('static-remote-audio-container');
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }

    this.isSpeaking = false;
    this.isMuted = false;
    this.isAutoplayBlocked = false;
    this.hasRegisteredUnlockListeners = false;
    this.micStartingPromise = null;
  }
}

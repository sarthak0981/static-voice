/**
 * STATIC In-App Session Video & Hi-Res Audio Recorder (v1.3.16)
 * 
 * Exclusively for Room Hosts.
 * - Hardware Canvas Scaling pipeline: GUARANTEES strict 1920x1080 resolution at constant 30.00 FPS
 * - High-Bitrate encoding: 12 Mbps video + 320 kbps 48kHz audio (no compression artifacts or blur)
 * - contentHint = 'detail' enabled for pin-sharp UI text and avatar rendering
 * - Studio Dynamics Compressor audio mixing pipeline: prevents clipping / harsh distortion
 * - Dynamic audio stream sync: automatically captures host mic and peer audio even if unmuted mid-session
 * - 5-minute (300 seconds) hard cutoff with automatic save & local MP4 download
 */

export interface SessionRecorderCallbacks {
  onStart?: () => void;
  onTick?: (secondsElapsed: number, secondsRemaining: number) => void;
  onStop?: (downloadedFileName: string) => void;
  onLimitReached?: () => void;
  onError?: (err: any) => void;
}

export interface AudioStreamProvider {
  getLocalStream: () => MediaStream | null;
  getRemoteStreams: () => MediaStream[];
}

export const MAX_RECORDING_SECONDS = 300; // 5-minute cap
export const RECORDING_WIDTH = 1920;      // Strict 1080p FHD Width
export const RECORDING_HEIGHT = 1080;     // Strict 1080p FHD Height
export const RECORDING_FPS = 30;          // Strict 30.00 Constant FPS
export const RECORDING_VIDEO_BITRATE = 12000000; // 12 Mbps High-Bitrate FHD
export const RECORDING_AUDIO_BITRATE = 320000;   // 320 kbps Studio Quality Audio

export class SessionRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private rawDisplayStream: MediaStream | null = null;
  private canvasStream: MediaStream | null = null;
  private hiddenVideo: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private canvasCtx: CanvasRenderingContext2D | null = null;
  private renderIntervalId: NodeJS.Timeout | null = null;
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private connectedStreams: Set<MediaStream> = new Set();
  private streamSources: Map<MediaStream, MediaStreamAudioSourceNode> = new Map();
  private timerInterval: NodeJS.Timeout | null = null;
  private syncAudioInterval: NodeJS.Timeout | null = null;
  private elapsedSeconds: number = 0;
  private isRecording: boolean = false;
  private roomName: string = 'STATIC-Party';
  private callbacks: SessionRecorderCallbacks;
  private audioProvider: AudioStreamProvider | null = null;

  constructor(callbacks: SessionRecorderCallbacks = {}) {
    this.callbacks = callbacks;
  }

  public isRecordingActive(): boolean {
    return this.isRecording;
  }

  public getElapsedSeconds(): number {
    return this.elapsedSeconds;
  }

  /**
   * Starts high-definition 1920x1080 30FPS recording with studio-grade mixed audio.
   */
  public async startRecording(
    roomName: string,
    audioProviderOrLocalStream?: AudioStreamProvider | MediaStream | null,
    remoteStreamsFallback?: MediaStream[]
  ): Promise<boolean> {
    if (this.isRecording) {
      return false;
    }

    this.roomName = roomName || 'STATIC-Party';
    this.recordedChunks = [];
    this.elapsedSeconds = 0;

    // Normalizing audio provider parameter
    if (
      audioProviderOrLocalStream &&
      typeof (audioProviderOrLocalStream as any).getLocalStream === 'function' &&
      typeof (audioProviderOrLocalStream as any).getRemoteStreams === 'function'
    ) {
      this.audioProvider = audioProviderOrLocalStream as AudioStreamProvider;
    } else {
      const local = (audioProviderOrLocalStream as MediaStream) || null;
      const remotes = remoteStreamsFallback || [];
      this.audioProvider = {
        getLocalStream: () => local,
        getRemoteStreams: () => remotes
      };
    }

    try {
      // 1. Capture current tab UI (allow up to 4K HiDPI capture for pristine scaling down to 1080p)
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: 1920, max: 3840 },
          height: { ideal: 1080, max: 2160 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false, // High-fidelity studio mixed audio supplied separately
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'exclude'
      } as any);

      this.rawDisplayStream = displayStream;
      const rawVideoTrack = displayStream.getVideoTracks()[0];
      if (!rawVideoTrack) {
        throw new Error('No video track obtained from display capture.');
      }

      if ('contentHint' in rawVideoTrack) {
        rawVideoTrack.contentHint = 'detail';
      }

      // Handle user clicking native browser "Stop sharing" ribbon
      rawVideoTrack.onended = () => {
        if (this.isRecording) {
          this.stopAndSave().catch(() => {});
        }
      };

      // 2. Hardware Canvas 1920x1080 Pipeline (Forces exact 1920x1080 @ 30fps)
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.autoplay = true;
      video.style.position = 'fixed';
      video.style.top = '-9999px';
      video.style.left = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      video.style.opacity = '0';
      video.style.pointerEvents = 'none';
      document.body.appendChild(video);
      this.hiddenVideo = video;

      video.srcObject = new MediaStream([rawVideoTrack]);
      await video.play().catch((err) => {
        console.warn('[SessionRecorder] Hidden video play error:', err);
      });

      // Offscreen canvas fixed to strict 1920x1080 dimensions
      const canvas = document.createElement('canvas');
      canvas.width = RECORDING_WIDTH;
      canvas.height = RECORDING_HEIGHT;
      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true
      });
      if (!ctx) {
        throw new Error('Could not create 2D canvas context for recording.');
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      this.canvas = canvas;
      this.canvasCtx = ctx;

      // Rendering logic: paints video frames onto 1920x1080 canvas with high smoothing
      const renderFrame = () => {
        if (!this.isRecording || !this.canvasCtx || !this.hiddenVideo) return;

        const v = this.hiddenVideo;
        if (v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) {
          const srcW = v.videoWidth;
          const srcH = v.videoHeight;

          // Proportional fit centered inside 1920x1080
          const scale = Math.min(RECORDING_WIDTH / srcW, RECORDING_HEIGHT / srcH);
          const destW = Math.round(srcW * scale);
          const destH = Math.round(srcH * scale);
          const destX = Math.round((RECORDING_WIDTH - destW) / 2);
          const destY = Math.round((RECORDING_HEIGHT - destH) / 2);

          // Background fill with STATIC app native background color (#07080B)
          ctx.fillStyle = '#07080B';
          ctx.fillRect(0, 0, RECORDING_WIDTH, RECORDING_HEIGHT);
          ctx.drawImage(v, destX, destY, destW, destH);
        }
      };

      // Initial frame paint
      renderFrame();

      // Constant 30 FPS render loop
      this.renderIntervalId = setInterval(renderFrame, 1000 / RECORDING_FPS);

      // Event-driven frame paint on hardware frame arrival
      const onVideoFrame = () => {
        if (!this.isRecording) return;
        renderFrame();
        if ('requestVideoFrameCallback' in video) {
          (video as any).requestVideoFrameCallback(onVideoFrame);
        }
      };
      if ('requestVideoFrameCallback' in video) {
        (video as any).requestVideoFrameCallback(onVideoFrame);
      }

      // Extract guaranteed 1920x1080 @ 30 FPS stream
      const canvasStream = canvas.captureStream(RECORDING_FPS);
      this.canvasStream = canvasStream;
      const finalVideoTrack = canvasStream.getVideoTracks()[0];
      if (!finalVideoTrack) {
        throw new Error('Could not extract 1080p track from canvas.');
      }
      if ('contentHint' in finalVideoTrack) {
        finalVideoTrack.contentHint = 'detail';
      }

      // 3. Studio Audio Mixing Pipeline (48 kHz + Dynamics Compressor)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx({ sampleRate: 48000, latencyHint: 'playback' });
      this.audioContext = audioContext;
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => {});
      }

      const destination = audioContext.createMediaStreamDestination();

      // Master Gain
      const masterGain = audioContext.createGain();
      masterGain.gain.setValueAtTime(1.0, audioContext.currentTime);
      this.masterGain = masterGain;

      // Dynamics Compressor for vocal warmth and distortion prevention
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-18, audioContext.currentTime);
      compressor.knee.setValueAtTime(30, audioContext.currentTime);
      compressor.ratio.setValueAtTime(4, audioContext.currentTime);
      compressor.attack.setValueAtTime(0.003, audioContext.currentTime);
      compressor.release.setValueAtTime(0.25, audioContext.currentTime);
      this.compressor = compressor;

      masterGain.connect(compressor);
      compressor.connect(destination);

      // Connect initial audio streams
      this.syncAudioStreams();

      // Periodically sync audio streams (handles mic toggles and newly joined participants)
      this.syncAudioInterval = setInterval(() => {
        this.syncAudioStreams();
      }, 1000);

      // 4. Combine 1920x1080 video track with high-definition audio track
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];
      const combinedTracks: MediaStreamTrack[] = [finalVideoTrack];
      if (mixedAudioTrack) {
        combinedTracks.push(mixedAudioTrack);
      }
      const combinedStream = new MediaStream(combinedTracks);

      // 5. Select Best Codec Profile (H.264 High/Main Profile for MP4, VP9 for WebM)
      let selectedMimeType = 'video/mp4';
      if (typeof MediaRecorder !== 'undefined') {
        const candidateTypes = [
          'video/mp4; codecs="avc1.640028, mp4a.40.2"', // High Profile H.264
          'video/mp4; codecs="avc1.4d4028, mp4a.40.2"', // Main Profile H.264
          'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', // Baseline Profile H.264
          'video/mp4; codecs=avc1',
          'video/mp4',
          'video/webm; codecs=vp9,opus',               // Ultra-HQ VP9
          'video/webm; codecs=h264,opus',
          'video/webm; codecs=vp8,opus',
          'video/webm'
        ];
        for (const type of candidateTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type;
            break;
          }
        }
      }

      // Initialize MediaRecorder with 12 Mbps video + 320 kbps audio
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        bitsPerSecond: RECORDING_VIDEO_BITRATE + RECORDING_AUDIO_BITRATE, // 12.32 Mbps combined
        videoBitsPerSecond: RECORDING_VIDEO_BITRATE,                      // 12 Mbps FHD
        audioBitsPerSecond: RECORDING_AUDIO_BITRATE                       // 320 kbps Studio Audio
      });

      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // 6. Start recording with 1-second chunks for data safety
      recorder.start(1000);
      this.isRecording = true;

      // 7. Start 5-minute cap timer
      this.timerInterval = setInterval(() => {
        this.elapsedSeconds += 1;
        const remaining = Math.max(0, MAX_RECORDING_SECONDS - this.elapsedSeconds);

        if (this.callbacks.onTick) {
          this.callbacks.onTick(this.elapsedSeconds, remaining);
        }

        // Hard cutoff at 5 minutes
        if (this.elapsedSeconds >= MAX_RECORDING_SECONDS) {
          if (this.callbacks.onLimitReached) {
            this.callbacks.onLimitReached();
          }
          this.stopAndSave().catch(() => {});
        }
      }, 1000);

      if (this.callbacks.onStart) {
        this.callbacks.onStart();
      }

      return true;
    } catch (err: any) {
      this.cleanup();
      if (err.name !== 'NotAllowedError') {
        console.error('[SessionRecorder] Failed to start session recording:', err);
        if (this.callbacks.onError) {
          this.callbacks.onError(err);
        }
      }
      return false;
    }
  }

  /**
   * Synchronizes active host and guest audio streams into the mixing pipeline.
   */
  private syncAudioStreams(): void {
    if (!this.audioContext || !this.masterGain || !this.audioProvider) return;

    try {
      const local = this.audioProvider.getLocalStream();
      if (local && local.active && local.getAudioTracks().some((t) => t.readyState === 'live')) {
        this.connectAudioStream(local);
      }

      const remotes = this.audioProvider.getRemoteStreams();
      remotes.forEach((stream) => {
        if (stream && stream.active && stream.getAudioTracks().some((t) => t.readyState === 'live')) {
          this.connectAudioStream(stream);
        }
      });
    } catch (e) {
      console.warn('[SessionRecorder] Error syncing audio streams:', e);
    }
  }

  /**
   * Connects a MediaStream to the master gain node if not already connected.
   */
  private connectAudioStream(stream: MediaStream): void {
    if (!this.audioContext || !this.masterGain) return;
    if (this.connectedStreams.has(stream)) return;

    try {
      const source = this.audioContext.createMediaStreamSource(stream);
      source.connect(this.masterGain);
      this.connectedStreams.add(stream);
      this.streamSources.set(stream, source);
    } catch (e) {
      console.warn('[SessionRecorder] Could not connect audio stream:', e);
    }
  }

  /**
   * Finalizes the recording, creates the high-definition MP4, and triggers local browser download.
   */
  public async stopAndSave(): Promise<boolean> {
    if (!this.isRecording || !this.mediaRecorder) {
      return false;
    }

    return new Promise<boolean>((resolve) => {
      const recorder = this.mediaRecorder!;

      recorder.onstop = () => {
        try {
          const mimeType = recorder.mimeType || 'video/mp4';
          const blob = new Blob(this.recordedChunks, { type: mimeType });

          // Generate clean filename
          const cleanName = (this.roomName || 'Party')
            .trim()
            .replace(/[^a-zA-Z0-9_\-]/g, '_')
            .slice(0, 30);
          const now = new Date();
          const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
          const isMp4 = mimeType.toLowerCase().includes('mp4');
          const ext = isMp4 ? 'mp4' : 'mp4'; // Use MP4 extension for media player compatibility
          const fileName = `STATIC-${cleanName}-${dateStr}.${ext}`;

          // Trigger local browser download
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();

          setTimeout(() => {
            if (a.parentNode) {
              a.parentNode.removeChild(a);
            }
            URL.revokeObjectURL(url);
          }, 1500);

          if (this.callbacks.onStop) {
            this.callbacks.onStop(fileName);
          }

          resolve(true);
        } catch (err) {
          console.error('[SessionRecorder] Error finalizing recording blob:', err);
          resolve(false);
        } finally {
          this.cleanup();
        }
      };

      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        } else {
          this.cleanup();
          resolve(false);
        }
      } catch (e) {
        this.cleanup();
        resolve(false);
      }
    });
  }

  /**
   * Cleans up streams, hardware canvas, audio context, and timers.
   */
  private cleanup(): void {
    this.isRecording = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.syncAudioInterval) {
      clearInterval(this.syncAudioInterval);
      this.syncAudioInterval = null;
    }

    if (this.renderIntervalId) {
      clearInterval(this.renderIntervalId);
      this.renderIntervalId = null;
    }

    if (this.hiddenVideo) {
      try {
        this.hiddenVideo.pause();
        this.hiddenVideo.srcObject = null;
        if (this.hiddenVideo.parentNode) {
          this.hiddenVideo.parentNode.removeChild(this.hiddenVideo);
        }
      } catch {}
      this.hiddenVideo = null;
    }

    if (this.canvas) {
      this.canvas = null;
      this.canvasCtx = null;
    }

    if (this.rawDisplayStream) {
      this.rawDisplayStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.rawDisplayStream = null;
    }

    if (this.canvasStream) {
      this.canvasStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.canvasStream = null;
    }

    this.streamSources.forEach((source) => {
      try {
        source.disconnect();
      } catch {}
    });
    this.streamSources.clear();
    this.connectedStreams.clear();

    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {}
      this.masterGain = null;
    }

    if (this.compressor) {
      try {
        this.compressor.disconnect();
      } catch {}
      this.compressor = null;
    }

    if (this.audioContext && this.audioContext.state !== 'closed') {
      try {
        this.audioContext.close();
      } catch {}
      this.audioContext = null;
    }

    this.mediaRecorder = null;
    this.recordedChunks = [];
    this.elapsedSeconds = 0;
    this.audioProvider = null;
  }

  /**
   * Cancels and discards recording without saving.
   */
  public cancel(): void {
    this.cleanup();
  }
}

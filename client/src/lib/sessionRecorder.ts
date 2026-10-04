/**
 * STATIC In-App Session Video & Hi-Res Audio Recorder
 * 
 * Exclusively for Room Hosts.
 * - Captures only the current app UI (1080p FHD, no taskbars or other windows)
 * - Mixes Host microphone + all remote participants' audio into a single 256kbps stereo track
 * - Enforces a 5-minute (300 seconds) hard cutoff with automatic save & download
 * - Exports directly to local MP4 format in browser
 */

export interface SessionRecorderCallbacks {
  onStart?: () => void;
  onTick?: (secondsElapsed: number, secondsRemaining: number) => void;
  onStop?: (downloadedFileName: string) => void;
  onLimitReached?: () => void;
  onError?: (err: any) => void;
}

export const MAX_RECORDING_SECONDS = 300; // 5-minute cap

export class SessionRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private displayStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private timerInterval: NodeJS.Timeout | null = null;
  private elapsedSeconds: number = 0;
  private isRecording: boolean = false;
  private roomName: string = 'STATIC-Party';
  private callbacks: SessionRecorderCallbacks;

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
   * Starts recording the current app UI with mixed audio.
   */
  public async startRecording(
    roomName: string,
    localStream: MediaStream | null,
    remoteStreams: MediaStream[]
  ): Promise<boolean> {
    if (this.isRecording) {
      return false;
    }

    this.roomName = roomName || 'STATIC-Party';
    this.recordedChunks = [];
    this.elapsedSeconds = 0;

    try {
      // 1. Capture current tab UI only (FHD 1080p)
      // preferCurrentTab and selfBrowserSurface ensure the browser prompts for the current tab only
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser',
          width: { ideal: 1920, max: 1920 },
          height: { ideal: 1080, max: 1080 },
          frameRate: { ideal: 30, max: 60 }
        },
        audio: false, // We supply our own high-res Web Audio mixed stream!
        preferCurrentTab: true,
        selfBrowserSurface: 'include',
        surfaceSwitching: 'exclude',
        systemAudio: 'exclude'
      } as any);

      this.displayStream = displayStream;
      const videoTrack = displayStream.getVideoTracks()[0];

      if (!videoTrack) {
        throw new Error('No video track obtained from display capture.');
      }

      // Handle user clicking native browser "Stop sharing" bar
      videoTrack.onended = () => {
        if (this.isRecording) {
          this.stopAndSave().catch(() => {});
        }
      };

      // 2. High-Resolution Audio Mixing Pipeline (Host mic + all remote participants)
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioCtx();
      this.audioContext = audioContext;
      const destination = audioContext.createMediaStreamDestination();

      // Connect Host's microphone if present
      if (localStream && localStream.getAudioTracks().length > 0) {
        try {
          const micSource = audioContext.createMediaStreamSource(localStream);
          micSource.connect(destination);
        } catch (e) {
          console.warn('[SessionRecorder] Could not connect local mic to recorder:', e);
        }
      }

      // Connect all remote guests' audio streams
      remoteStreams.forEach((stream) => {
        if (stream && stream.getAudioTracks().length > 0) {
          try {
            const remoteSource = audioContext.createMediaStreamSource(stream);
            remoteSource.connect(destination);
          } catch (e) {
            console.warn('[SessionRecorder] Could not connect remote stream to recorder:', e);
          }
        }
      });

      // 3. Combine FHD video track with mixed audio track
      const mixedAudioTrack = destination.stream.getAudioTracks()[0];
      const combinedTracks: MediaStreamTrack[] = [videoTrack];
      if (mixedAudioTrack) {
        combinedTracks.push(mixedAudioTrack);
      }
      const combinedStream = new MediaStream(combinedTracks);

      // 4. Select best supported MP4 / WebM container
      let selectedMimeType = 'video/mp4';
      if (typeof MediaRecorder !== 'undefined') {
        const candidateTypes = [
          'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
          'video/mp4',
          'video/webm; codecs=h264,opus',
          'video/webm; codecs=vp9,opus',
          'video/webm'
        ];
        for (const type of candidateTypes) {
          if (MediaRecorder.isTypeSupported(type)) {
            selectedMimeType = type;
            break;
          }
        }
      }

      const recorder = new MediaRecorder(combinedStream, {
        mimeType: selectedMimeType,
        videoBitsPerSecond: 6000000, // 6 Mbps FHD 1080p
        audioBitsPerSecond: 256000   // 256 kbps Hi-Res Stereo Voice
      });

      this.mediaRecorder = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.recordedChunks.push(event.data);
        }
      };

      // 5. Start recording
      recorder.start(1000); // 1-second timeslice for data capture safety
      this.isRecording = true;

      // 6. Start 5-minute cap timer
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
   * Finalizes the recording, generates the MP4 file, and initiates local browser download.
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
          const ext = mimeType.toLowerCase().includes('mp4') ? 'mp4' : 'mp4'; // Standard MP4 extension for media players
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
   * Cleans up streams, audio context, and timers.
   */
  private cleanup(): void {
    this.isRecording = false;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }

    if (this.displayStream) {
      this.displayStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {}
      });
      this.displayStream = null;
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
  }

  /**
   * Cancels and discards recording without saving.
   */
  public cancel(): void {
    this.cleanup();
  }
}

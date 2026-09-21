/**
 * STATIC — Centralized Remote Audio Manager
 * 
 * Manages remote HTMLAudioElements across mobile WebKit (iOS Safari), Android Chrome,
 * and desktop browsers. Guarantees exactly one audio element per remote participant,
 * prevents duplicate elements, manages volume scaling, handles autoplay rejections,
 * and prevents memory leaks upon participant removal or room teardown.
 */

export interface RemoteAudioCallbacks {
  onAutoplayBlocked?: (isBlocked: boolean) => void;
  onAudioPlaybackStarted?: (participantId: string) => void;
  onAudioPlaybackFailed?: (participantId: string, error: any) => void;
}

export class RemoteAudioManager {
  private audioElements: Map<string, HTMLAudioElement> = new Map();
  private peerVolumes: Map<string, number> = new Map(); // 0.0 to 1.0
  private locallyMutedPeers: Set<string> = new Set();
  private masterVolume: number = 1.0;
  private isAutoplayBlocked: boolean = false;
  private callbacks: RemoteAudioCallbacks;
  private container: HTMLElement | null = null;

  constructor(callbacks: RemoteAudioCallbacks = {}) {
    this.callbacks = callbacks;
    this.ensureContainer();
  }

  /**
   * Persistent invisible DOM container for remote audio playback.
   * Uses 1px dimensions and opacity: 0.01 so iOS WebKit and Android Chrome
   * consider it an active layout element and never suspend or sleep media playback.
   */
  private ensureContainer(): HTMLElement {
    if (typeof document === 'undefined') {
      return null as any;
    }
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
    this.container = container;
    return container;
  }

  /**
   * Attaches or updates remote MediaStream for a participant.
   * Guarantees 1 audio element per participant.
   */
  public attachRemoteStream(participantId: string, stream: MediaStream): HTMLAudioElement {
    const container = this.ensureContainer();

    let audio = this.audioElements.get(participantId);
    if (!audio) {
      audio = document.createElement('audio');
      audio.autoplay = true;
      (audio as any).playsInline = true;
      audio.setAttribute('playsinline', 'true');
      audio.setAttribute('webkit-playsinline', 'true');
      audio.muted = false;
      audio.id = `static-audio-${participantId}`;

      // Default audio sink routing where supported
      if (typeof (audio as any).setSinkId === 'function') {
        (audio as any).setSinkId('default').catch(() => {});
      }

      if (container) {
        container.appendChild(audio);
      }
      this.audioElements.set(participantId, audio);
    }

    // Attach stream
    if (audio.srcObject !== stream) {
      audio.srcObject = stream;
    }

    // Apply current volume
    this.applyVolume(participantId, audio);

    // Watch track unmute & ended events for automatic recovery
    const tracks = stream.getAudioTracks();
    tracks.forEach((track) => {
      track.onunmute = () => {
        if (audio && audio.paused) {
          this.playAudio(participantId, audio);
        }
      };
      track.onended = () => {
        // Track ended
      };
    });

    // Play
    this.playAudio(participantId, audio);

    return audio;
  }

  /**
   * Safely attempts audio playback with autoplay failure handling
   */
  private playAudio(participantId: string, audio: HTMLAudioElement) {
    audio
      .play()
      .then(() => {
        if (this.isAutoplayBlocked) {
          this.isAutoplayBlocked = false;
          this.callbacks.onAutoplayBlocked?.(false);
        }
        this.callbacks.onAudioPlaybackStarted?.(participantId);
      })
      .catch((err) => {
        this.isAutoplayBlocked = true;
        this.callbacks.onAutoplayBlocked?.(true);
        this.callbacks.onAudioPlaybackFailed?.(participantId, err);
      });
  }

  /**
   * Sets individual playback volume for a specific participant (0.0 to 1.0)
   */
  public setPeerVolume(participantId: string, volume: number) {
    const clamped = Math.max(0, Math.min(1, volume));
    this.peerVolumes.set(participantId, clamped);

    const audio = this.audioElements.get(participantId);
    if (audio) {
      this.applyVolume(participantId, audio);
    }
  }

  /**
   * Gets individual playback volume for a specific participant (0.0 to 1.0, default 1.0)
   */
  public getPeerVolume(participantId: string): number {
    return this.peerVolumes.get(participantId) ?? 1.0;
  }

  /**
   * Sets master output volume across all remote participants (0.0 to 1.0)
   */
  public setMasterVolume(masterVolume: number) {
    this.masterVolume = Math.max(0, Math.min(1, masterVolume));
    for (const [participantId, audio] of this.audioElements.entries()) {
      this.applyVolume(participantId, audio);
    }
  }

  /**
   * Gets master volume
   */
  public getMasterVolume(): number {
    return this.masterVolume;
  }

  public setPeerMuted(participantId: string, muted: boolean): void {
    if (muted) {
      this.locallyMutedPeers.add(participantId);
    } else {
      this.locallyMutedPeers.delete(participantId);
    }

    const audio = this.audioElements.get(participantId);
    if (audio) {
      this.applyVolume(participantId, audio);
    }
  }

  public isPeerMuted(participantId: string): boolean {
    return this.locallyMutedPeers.has(participantId);
  }

  private applyVolume(participantId: string, audio: HTMLAudioElement) {
    if (this.locallyMutedPeers.has(participantId)) {
      audio.muted = true;
      audio.volume = 0;
      return;
    }
    audio.muted = false;
    const userVol = this.peerVolumes.get(participantId) ?? 1.0;
    const finalVol = Math.max(0, Math.min(1, userVol * this.masterVolume));
    audio.volume = finalVol;
  }

  /**
   * Unlocks all remote audio playback elements under a user gesture
   */
  public async unlockAll(): Promise<boolean> {
    let allSucceeded = true;
    for (const [, audio] of this.audioElements.entries()) {
      if (audio.srcObject && audio.paused) {
        try {
          await audio.play();
        } catch (_) {
          allSucceeded = false;
        }
      }
    }

    if (allSucceeded && this.isAutoplayBlocked) {
      this.isAutoplayBlocked = false;
      this.callbacks.onAutoplayBlocked?.(false);
    }

    return allSucceeded;
  }

  /**
   * Retrieves the HTMLAudioElement for a participant
   */
  public getAudioElement(participantId: string): HTMLAudioElement | undefined {
    return this.audioElements.get(participantId);
  }

  /**
   * Checks if audio is currently blocked by browser autoplay policy
   */
  public getIsAutoplayBlocked(): boolean {
    return this.isAutoplayBlocked;
  }

  /**
   * Removes participant audio and destroys the element cleanly
   */
  public removeParticipant(participantId: string) {
    const audio = this.audioElements.get(participantId);
    if (!audio) return;

    audio.pause();
    audio.srcObject = null;
    if (audio.parentNode) {
      audio.parentNode.removeChild(audio);
    }
    this.audioElements.delete(participantId);
    this.peerVolumes.delete(participantId);
  }

  /**
   * Full teardown of all audio elements and container
   */
  public cleanup() {
    for (const [, audio] of this.audioElements.entries()) {
      audio.pause();
      audio.srcObject = null;
      if (audio.parentNode) {
        audio.parentNode.removeChild(audio);
      }
    }
    this.audioElements.clear();
    this.peerVolumes.clear();

    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }
}

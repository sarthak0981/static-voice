/**
 * Web Audio API synthesized notification chimes.
 * Generates an ethereal, subtle "ting" chime without requiring any external audio files.
 */
class NotificationSound {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    } catch {
      return null;
    }
  }

  /**
   * Plays a delicate, gentle "ting" chime for incoming chat messages.
   * Soft attack with smooth exponential decay over ~380ms.
   */
  public playChatTing(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // Primary tone (harmonic fundamental)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1046.5, now); // C6
      osc1.frequency.exponentialRampToValueAtTime(1318.51, now + 0.06); // E6

      gain1.gain.setValueAtTime(0.0001, now);
      gain1.gain.exponentialRampToValueAtTime(0.045, now + 0.015); // subtle peak
      gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.38); // gentle fade

      osc1.connect(gain1);
      gain1.connect(ctx.destination);

      // Shimmer overtone for crystal chime feel
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();

      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2093.0, now); // C7 octave harmonic
      gain2.gain.setValueAtTime(0.0001, now);
      gain2.gain.exponentialRampToValueAtTime(0.015, now + 0.01);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);

      osc2.connect(gain2);
      gain2.connect(ctx.destination);

      osc1.start(now);
      osc1.stop(now + 0.4);
      osc2.start(now);
      osc2.stop(now + 0.25);
    } catch {
      // Audio playback fails gracefully if browser autoplay policy restricts it
    }
  }
}

export const notificationSound = new NotificationSound();

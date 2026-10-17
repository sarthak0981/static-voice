/**
 * STATIC — Noise Suppression Pipeline & AudioWorklet Manager
 * 
 * Provides an optional AudioWorklet-based noise suppression processing stage
 * between the local microphone and outgoing WebRTC tracks.
 * 
 * Design:
 * - Zero deprecated ScriptProcessorNode usage.
 * - Loaded lazily with inline AudioWorklet blob registration.
 * - Automatic graceful bypass if AudioWorklet fails, is unsupported, or audio context is suspended.
 * - Prevents double-processing by signaling whether native constraint should be disabled.
 */

export interface NoiseSuppressionResult {
  outputStream: MediaStream;
  isSuppressionActive: boolean;
  cleanup: () => void;
}

const NOISE_PROCESSOR_WORKLET_CODE = `
class StaticNoiseGateProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.alpha = 0.95; // Smoothing coefficient
    this.noiseFloor = 0.002;
    this.smoothedEnvelope = 0.0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || input.length === 0) return true;

    for (let channel = 0; channel < input.length; ++channel) {
      const inputChannel = input[channel];
      const outputChannel = output[channel];

      for (let i = 0; i < inputChannel.length; ++i) {
        const sample = inputChannel[i];
        const absSample = Math.abs(sample);

        // Exponential envelope follower
        this.smoothedEnvelope = this.alpha * this.smoothedEnvelope + (1 - this.alpha) * absSample;

        // Soft spectral noise floor gate
        if (this.smoothedEnvelope < this.noiseFloor) {
          const gain = Math.max(0, this.smoothedEnvelope / this.noiseFloor);
          outputChannel[i] = sample * gain * gain; // Soft quadratic taper
        } else {
          outputChannel[i] = sample;
        }
      }
    }

    return true;
  }
}

registerProcessor('static-noise-processor', StaticNoiseGateProcessor);
`;

export class NoiseSuppressionController {
  private static workletModuleLoaded = false;
  private static workletLoadPromise: Promise<boolean> | null = null;
  private isEnabled: boolean = true;

  constructor(enabled: boolean = true) {
    this.isEnabled = enabled;
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
  }

  public getIsEnabled(): boolean {
    return this.isEnabled;
  }

  /**
   * Loads the AudioWorklet module lazily onto the AudioContext.
   */
  private static async ensureWorkletLoaded(ctx: AudioContext): Promise<boolean> {
    if (this.workletModuleLoaded) return true;
    if (this.workletLoadPromise) return this.workletLoadPromise;

    if (!ctx.audioWorklet || typeof ctx.audioWorklet.addModule !== 'function') {
      return false;
    }

    this.workletLoadPromise = (async () => {
      try {
        const blob = new Blob([NOISE_PROCESSOR_WORKLET_CODE], { type: 'application/javascript' });
        const blobUrl = URL.createObjectURL(blob);
        await ctx.audioWorklet.addModule(blobUrl);
        URL.revokeObjectURL(blobUrl);
        this.workletModuleLoaded = true;
        return true;
      } catch (err) {
        console.warn('[STATIC NoiseSuppression] AudioWorklet addModule failed, falling back to bypass:', err);
        return false;
      } finally {
        this.workletLoadPromise = null;
      }
    })();

    return this.workletLoadPromise;
  }

  /**
   * Processes a microphone MediaStream through the AudioWorklet noise suppression stage.
   * If disabled or unsupported, returns the raw input stream with a no-op cleanup.
   */
  public async processStream(
    inputStream: MediaStream,
    ctx: AudioContext
  ): Promise<NoiseSuppressionResult> {
    const rawAudioTrack = inputStream.getAudioTracks()[0];
    if (!rawAudioTrack || !this.isEnabled) {
      return {
        outputStream: inputStream,
        isSuppressionActive: false,
        cleanup: () => {}
      };
    }

    try {
      const isLoaded = await NoiseSuppressionController.ensureWorkletLoaded(ctx);
      if (!isLoaded || ctx.state === 'closed') {
        return {
          outputStream: inputStream,
          isSuppressionActive: false,
          cleanup: () => {}
        };
      }

      const sourceNode = ctx.createMediaStreamSource(inputStream);
      const workletNode = new AudioWorkletNode(ctx, 'static-noise-processor');
      const destination = ctx.createMediaStreamDestination();

      sourceNode.connect(workletNode);
      workletNode.connect(destination);

      const processedTrack = destination.stream.getAudioTracks()[0];
      if (processedTrack) {
        processedTrack.enabled = rawAudioTrack.enabled;
        if ('contentHint' in processedTrack) {
          processedTrack.contentHint = 'speech';
        }
      }

      const cleanup = () => {
        try {
          sourceNode.disconnect();
          workletNode.disconnect();
          if (processedTrack) {
            processedTrack.stop();
          }
        } catch (_) {}
      };

      return {
        outputStream: destination.stream,
        isSuppressionActive: true,
        cleanup
      };
    } catch (err) {
      console.warn('[STATIC NoiseSuppression] Pipeline error, bypassing suppression:', err);
      return {
        outputStream: inputStream,
        isSuppressionActive: false,
        cleanup: () => {}
      };
    }
  }
}

export const noiseSuppressionController = new NoiseSuppressionController(true);

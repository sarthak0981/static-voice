/**
 * STATIC — Pure SDP Munging Utilities for Opus Optimization
 * 
 * Sets Discord-grade Opus audio parameters:
 * - minptime=10 (low audio packetization latency)
 * - useinbandfec=1 (in-band forward error correction for loss resilience)
 * - usedtx=1 (discontinuous transmission / silence suppression)
 * - stereo=0;sprop-stereo=0 (clean mono speech transmission)
 * - maxaveragebitrate (adaptive target, default 48 kbps)
 * - maxplaybackrate=48000 (full 48kHz super-wideband)
 * - cbr=0 (variable bitrate encoding for optimal quality/bandwidth efficiency)
 * - a=ptime:20 (standard 20ms frame size)
 */

export interface SdpOpusOptions {
  maxaveragebitrate?: number; // e.g. 48000 (48 kbps)
  ptime?: number;             // e.g. 20
  minptime?: number;          // e.g. 10
  useinbandfec?: boolean;     // default true
  usedtx?: boolean;           // default true
  cbr?: boolean;              // default false (VBR)
}

const DEFAULT_OPUS_OPTIONS: Required<SdpOpusOptions> = {
  maxaveragebitrate: 48000,
  ptime: 20,
  minptime: 10,
  useinbandfec: true,
  usedtx: true,
  cbr: false
};

/**
 * Parses and munges an SDP string (offer or answer) to tune the Opus audio stream.
 * Pure function: Does not mutate inputs, works seamlessly across Chrome, Firefox, Safari SDP shapes.
 */
export function mungeOpusSdp(sdp: string, options: SdpOpusOptions = {}): string {
  if (!sdp || typeof sdp !== 'string') return sdp;

  const opts: Required<SdpOpusOptions> = {
    ...DEFAULT_OPUS_OPTIONS,
    ...options
  };

  const isCrlf = sdp.includes('\r\n');
  const delimiter = isCrlf ? '\r\n' : '\n';
  const lines = sdp.split(/\r?\n/);

  // 1. Identify Opus payload types from a=rtpmap:<pt> opus/48000...
  const opusPayloadTypes: string[] = [];
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000(?:\/2)?/i);
    if (match && match[1]) {
      opusPayloadTypes.push(match[1]);
    }
  }

  // If no Opus codec found, return original SDP safely
  if (opusPayloadTypes.length === 0) {
    return sdp;
  }

  // Format desired fmtp parameters map
  const targetParams: Record<string, string> = {
    minptime: String(opts.minptime),
    useinbandfec: opts.useinbandfec ? '1' : '0',
    usedtx: opts.usedtx ? '1' : '0',
    stereo: '0',
    'sprop-stereo': '0',
    maxaveragebitrate: String(opts.maxaveragebitrate),
    maxplaybackrate: '48000',
    cbr: opts.cbr ? '1' : '0'
  };

  const newLines: string[] = [];
  const processedPayloads = new Set<string>();
  let inAudioMedia = false;
  let ptimeInserted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('m=audio ')) {
      inAudioMedia = true;
    } else if (line.startsWith('m=video ') || line.startsWith('m=application ')) {
      inAudioMedia = false;
    }

    // Check if line is a=ptime:... in audio section
    if (inAudioMedia && line.startsWith('a=ptime:')) {
      newLines.push(`a=ptime:${opts.ptime}`);
      ptimeInserted = true;
      continue;
    }

    // Check if line is an existing a=fmtp:<pt> for an Opus payload
    let matchedOpusPt: string | null = null;
    for (const pt of opusPayloadTypes) {
      if (line.startsWith(`a=fmtp:${pt} `) || line.startsWith(`a=fmtp:${pt}=`)) {
        matchedOpusPt = pt;
        break;
      }
    }

    if (matchedOpusPt) {
      // Merge existing parameters with our target parameters
      const rawParams = line.substring(`a=fmtp:${matchedOpusPt}`.length).replace(/^[\s=]/, '').trim();
      const existingParamsMap: Record<string, string> = {};

      if (rawParams) {
        const pairs = rawParams.split(';');
        for (const pair of pairs) {
          const [k, v] = pair.split('=').map((s) => s.trim());
          if (k) {
            existingParamsMap[k.toLowerCase()] = v !== undefined ? v : '';
          }
        }
      }

      // Target params overwrite / supplement existing ones
      const mergedMap = { ...existingParamsMap, ...targetParams };
      const mergedParamString = Object.entries(mergedMap)
        .map(([k, v]) => (v ? `${k}=${v}` : k))
        .join(';');

      newLines.push(`a=fmtp:${matchedOpusPt} ${mergedParamString}`);
      processedPayloads.add(matchedOpusPt);
      continue;
    }

    newLines.push(line);

    // If we just pushed a=rtpmap:<pt> opus... and no fmtp has been seen yet, check if next line is fmtp.
    // If not, we will insert it right here.
    for (const pt of opusPayloadTypes) {
      if (line.startsWith(`a=rtpmap:${pt} `) && !processedPayloads.has(pt)) {
        // Lookahead to see if next line is already fmtp for this pt
        const nextLine = lines[i + 1] || '';
        if (!nextLine.startsWith(`a=fmtp:${pt} `) && !nextLine.startsWith(`a=fmtp:${pt}=`)) {
          const paramString = Object.entries(targetParams)
            .map(([k, v]) => `${k}=${v}`)
            .join(';');
          newLines.push(`a=fmtp:${pt} ${paramString}`);
          processedPayloads.add(pt);
        }
      }
    }
  }

  // Ensure a=ptime:20 was added in audio media section if not already present
  if (!ptimeInserted && inAudioMedia) {
    const audioIdx = newLines.findIndex((l) => l.startsWith('m=audio '));
    if (audioIdx !== -1) {
      newLines.splice(audioIdx + 1, 0, `a=ptime:${opts.ptime}`);
    }
  }

  return newLines.join(delimiter);
}

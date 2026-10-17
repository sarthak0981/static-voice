import { describe, it, expect } from 'vitest';
import { mungeOpusSdp } from '../../../client/src/lib/sdp.js';

describe('SDP Opus Munging (mungeOpusSdp)', () => {
  const CHROME_SDP_SAMPLE = [
    'v=0',
    'o=- 1234567890 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 103 104 9 0 8 106 105 13 110 112 113 126',
    'c=IN IP4 0.0.0.0',
    'a=rtcp:9 IN IP4 0.0.0.0',
    'a=ice-ufrag:abcd',
    'a=ice-pwd:xyz1234567890',
    'a=rtpmap:111 opus/48000/2',
    'a=fmtp:111 minptime=10;useinbandfec=1',
    'a=rtcp-fb:111 transport-cc',
    'a=mid:0',
    'a=sendrecv'
  ].join('\r\n');

  const FIREFOX_SDP_SAMPLE = [
    'v=0',
    'o=mozilla...this_is_a_test 1 1 IN IP4 0.0.0.0',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 109 9 0 8',
    'c=IN IP4 0.0.0.0',
    'a=mid:sdparta_0',
    'a=rtpmap:109 opus/48000/2',
    'a=fmtp:109 maxplaybackrate=48000;stereo=0',
    'a=sendrecv'
  ].join('\n');

  const SAFARI_SDP_SAMPLE = [
    'v=0',
    'o=- 4567890123 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    'm=audio 9 UDP/TLS/RTP/SAVPF 111 0 8',
    'c=IN IP4 0.0.0.0',
    'a=rtpmap:111 opus/48000/2',
    'a=sendrecv'
  ].join('\r\n');

  it('injects complete discord-grade Opus parameters into Chrome SDP', () => {
    const munged = mungeOpusSdp(CHROME_SDP_SAMPLE, { maxaveragebitrate: 48000 });
    expect(munged).toContain('a=fmtp:111');
    expect(munged).toContain('minptime=10');
    expect(munged).toContain('useinbandfec=1');
    expect(munged).toContain('usedtx=1');
    expect(munged).toContain('stereo=0');
    expect(munged).toContain('sprop-stereo=0');
    expect(munged).toContain('maxaveragebitrate=48000');
    expect(munged).toContain('maxplaybackrate=48000');
    expect(munged).toContain('cbr=0');
    expect(munged).toContain('a=ptime:20');
  });

  it('handles Firefox SDP with LF line endings and existing fmtp', () => {
    const munged = mungeOpusSdp(FIREFOX_SDP_SAMPLE, { maxaveragebitrate: 40000 });
    expect(munged).toContain('a=fmtp:109');
    expect(munged).toContain('maxaveragebitrate=40000');
    expect(munged).toContain('usedtx=1');
    expect(munged).toContain('useinbandfec=1');
    expect(munged).toContain('a=ptime:20');
    // Verifies preserved LF delimiter
    expect(munged).not.toContain('\r\n');
  });

  it('synthesizes missing fmtp line for Safari SDP with no prior fmtp', () => {
    const munged = mungeOpusSdp(SAFARI_SDP_SAMPLE, { maxaveragebitrate: 32000 });
    expect(munged).toContain('a=fmtp:111');
    expect(munged).toContain('maxaveragebitrate=32000');
    expect(munged).toContain('minptime=10');
    expect(munged).toContain('useinbandfec=1');
    expect(munged).toContain('usedtx=1');
    expect(munged).toContain('a=ptime:20');
  });

  it('safely passes through SDP when no Opus payload type exists', () => {
    const NO_OPUS_SDP = [
      'v=0',
      'm=audio 9 UDP/TLS/RTP/SAVPF 0 8',
      'a=rtpmap:0 PCMU/8000',
      'a=rtpmap:8 PCMA/8000'
    ].join('\r\n');
    const munged = mungeOpusSdp(NO_OPUS_SDP);
    expect(munged).toBe(NO_OPUS_SDP);
  });

  it('handles empty or malformed inputs without throwing', () => {
    expect(mungeOpusSdp('')).toBe('');
    expect(mungeOpusSdp(null as any)).toBe(null);
    expect(mungeOpusSdp(undefined as any)).toBe(undefined);
  });
});

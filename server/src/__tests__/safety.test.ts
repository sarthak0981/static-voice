import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateTextSafety, normalizeForSafetyCheck } from '../safety.js';
import { validateAndSanitizeUsername, validateAndSanitizeRoomName } from '../validators.js';
import { RoomManager } from '../roomManager.js';

describe('STATIC Safety & Content Moderation Framework', () => {
  let rm: RoomManager;

  beforeEach(() => {
    rm = new RoomManager();
  });

  describe('1. Core Safety Evaluation (Google Guidelines Alignment)', () => {
    it('detects and restricts hate speech', () => {
      const res1 = evaluateTextSafety('You faggot', 'chat');
      expect(res1.isSafe).toBe(false);
      expect(res1.category).toBe('HATE_SPEECH');

      const res2 = evaluateTextSafety('nigger', 'username');
      expect(res2.isSafe).toBe(false);
      expect(res2.category).toBe('HATE_SPEECH');
    });

    it('detects and restricts violence, death threats, and self-harm incitement', () => {
      const res1 = evaluateTextSafety('I will murder you tonight', 'chat');
      expect(res1.isSafe).toBe(false);
      expect(res1.category).toBe('VIOLENCE_AND_THREATS');

      const res2 = evaluateTextSafety('go kill yourself right now', 'chat');
      expect(res2.isSafe).toBe(false);
      expect(res2.category).toBe('VIOLENCE_AND_THREATS');

      const res3 = evaluateTextSafety('kys', 'chat');
      expect(res3.isSafe).toBe(false);
      expect(res3.category).toBe('VIOLENCE_AND_THREATS');
    });

    it('detects and restricts sexually explicit terms', () => {
      const res1 = evaluateTextSafety('free child porn link', 'chat');
      expect(res1.isSafe).toBe(false);
      expect(res1.category).toBe('SEXUALLY_EXPLICIT');

      const res2 = evaluateTextSafety('blowjob', 'room_name');
      expect(res2.isSafe).toBe(false);
      expect(res2.category).toBe('SEXUALLY_EXPLICIT');
    });

    it('detects and restricts severe profanity and obscenity', () => {
      const res1 = evaluateTextSafety('fuck this room', 'chat');
      expect(res1.isSafe).toBe(false);
      expect(res1.category).toBe('SEVERE_PROFANITY');

      const res2 = evaluateTextSafety('motherfucker', 'username');
      expect(res2.isSafe).toBe(false);
      expect(res2.category).toBe('SEVERE_PROFANITY');
    });

    it('catches leetspeak and obfuscated evasion attempts', () => {
      // Leet substitution: ! -> i, @ -> a
      const res1 = evaluateTextSafety('n!gg@', 'username');
      expect(res1.isSafe).toBe(false);

      // Punctuation spaced: f.u.c.k
      const res2 = evaluateTextSafety('f.u.c.k', 'chat');
      expect(res2.isSafe).toBe(false);
    });

    it('avoids false positives on innocent words (Scunthorpe problem protection)', () => {
      const innocentWords = [
        'Classic Rock Jam',
        'Assistant Coach',
        'Passport Office',
        'Pass the salt',
        'Bass Guitar',
        'Grass Roots',
        'Butter and Jam',
        'Cocktail Lounge',
        'Document Sync',
        'Data Analysis',
        'Positive Attitude',
        'Witch House Music',
        'English Dictionary'
      ];

      for (const phrase of innocentWords) {
        const result = evaluateTextSafety(phrase, 'chat');
        expect(result.isSafe, `Expected "${phrase}" to be safe`).toBe(true);
      }
    });
  });

  describe('2. Validator Integration', () => {
    it('rejects unsafe usernames in validateAndSanitizeUsername', () => {
      const res = validateAndSanitizeUsername('kys');
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
      expect(res.safety?.category).toBe('VIOLENCE_AND_THREATS');
    });

    it('accepts safe usernames in validateAndSanitizeUsername', () => {
      const res = validateAndSanitizeUsername('AudioEngineer');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('AudioEngineer');
    });

    it('rejects unsafe room names in validateAndSanitizeRoomName', () => {
      const res = validateAndSanitizeRoomName('Kill Yourself Club');
      expect(res.isValid).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('defaults empty room names to "STATIC Party"', () => {
      const res = validateAndSanitizeRoomName('   ');
      expect(res.isValid).toBe(true);
      expect(res.normalized).toBe('STATIC Party');
    });
  });

  describe('3. RoomManager Lifecycle Enforcement', () => {
    it('blocks creating a room with an unsafe room name', () => {
      expect(() => {
        rm.createRoom('socket_1', 'I will murder you', 'HostUser');
      }).toThrow(/violence/i);
    });

    it('blocks creating a room with an unsafe host username', () => {
      expect(() => {
        rm.createRoom('socket_1', 'Safe Room', 'kys');
      }).toThrow(/violence/i);
    });

    it('blocks guest joining with an unsafe username', () => {
      const { room } = rm.createRoom('socket_host', 'Game Hub', 'ValidHost');
      const joinResult = rm.joinRoom(room.roomId, 'socket_guest', 'kys');
      expect(joinResult.success).toBe(false);
      expect(joinResult.errorCode).toBe('INVALID_INPUT');
      expect(joinResult.error).toMatch(/violence/i);
    });

    it('allows guest joining with safe username and room name', () => {
      const { room } = rm.createRoom('socket_host', 'Classic Lounge', 'ValidHost');
      const joinResult = rm.joinRoom(room.roomId, 'socket_guest', 'GuestMusician');
      expect(joinResult.success).toBe(true);
      expect(joinResult.participant?.displayName).toBe('GuestMusician');
    });
  });

  describe('4. Phase 4 Advanced Moderation: Homoglyphs, Repeats & Strike Tracking', () => {
    it('detects homoglyphs using Cyrillic lookalike letters', () => {
      // Cyrillic 'у' (U+0443) instead of Latin 'u'
      const homoglyph1 = 'f\u0443ck';
      const res1 = evaluateTextSafety(homoglyph1, 'chat');
      expect(res1.isSafe).toBe(false);

      // Cyrillic 'а' (U+0430) and 'і' (U+0456)
      const homoglyph2 = 'n\u0456gg\u0430';
      const res2 = evaluateTextSafety(homoglyph2, 'chat');
      expect(res2.isSafe).toBe(false);
      expect(res2.category).toBe('HATE_SPEECH');
    });

    it('collapses repeated characters to detect elongation evasion', () => {
      const repeated1 = 'fuuuuuck this';
      const res1 = evaluateTextSafety(repeated1, 'chat');
      expect(res1.isSafe).toBe(false);
      expect(res1.category).toBe('SEVERE_PROFANITY');

      const repeated2 = 'biiiiiitch';
      const res2 = evaluateTextSafety(repeated2, 'chat');
      expect(res2.isSafe).toBe(false);
    });

    it('strips zero-width characters and directional overrides', () => {
      // Zero-width space U+200B and joiner U+200D
      const zeroWidth = 'f\u200Bu\u200Dc\u200Bk';
      const res = evaluateTextSafety(zeroWidth, 'chat');
      expect(res.isSafe).toBe(false);
    });

    it('tracks rate-limited strikes: warn -> mute chat -> host notification', async () => {
      const { StrikeTracker } = await import('../safety.js');
      const tracker = new StrikeTracker();
      const user = 'p_violator_123';

      expect(tracker.isParticipantChatMuted(user)).toBe(false);

      // Strike 1: Warning
      const s1 = tracker.recordViolation(user);
      expect(s1.strikes).toBe(1);
      expect(s1.action).toBe('WARNED');
      expect(tracker.isParticipantChatMuted(user)).toBe(false);

      // Strike 2: Chat Muted
      const s2 = tracker.recordViolation(user);
      expect(s2.strikes).toBe(2);
      expect(s2.action).toBe('CHAT_MUTED');
      expect(s2.isMuted).toBe(true);
      expect(tracker.isParticipantChatMuted(user)).toBe(true);

      // Strike 3: Host Notified
      const s3 = tracker.recordViolation(user);
      expect(s3.strikes).toBe(3);
      expect(s3.action).toBe('NOTIFY_HOST');
      expect(s3.isMuted).toBe(true);
    });
  });
});

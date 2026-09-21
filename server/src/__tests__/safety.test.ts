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
});

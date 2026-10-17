import { describe, it, expect } from 'vitest';
import { generateHmacTurnCredentials, verifyHmacTurnCredentials } from '../turnCredentials.js';

describe('HMAC TURN Credentials Generator & Validator', () => {
  const SECRET = 'super-secret-turn-token-12345';

  it('generates valid credentials with expected username format', () => {
    const participantId = 'p_testuser99';
    const creds = generateHmacTurnCredentials(SECRET, participantId, 3600);

    expect(creds.username).toMatch(/^\d+:p_testuser99$/);
    expect(creds.credential).toBeDefined();
    expect(creds.credential.length).toBeGreaterThan(10);
    expect(creds.expiryUnix).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // Verify validity
    const isValid = verifyHmacTurnCredentials(SECRET, creds.username, creds.credential);
    expect(isValid).toBe(true);
  });

  it('rejects tampered credentials or wrong secret', () => {
    const creds = generateHmacTurnCredentials(SECRET, 'p_alice', 3600);

    // Tampered credential
    expect(verifyHmacTurnCredentials(SECRET, creds.username, 'wrong-credential')).toBe(false);

    // Wrong secret
    expect(verifyHmacTurnCredentials('wrong-secret', creds.username, creds.credential)).toBe(false);

    // Tampered username
    expect(verifyHmacTurnCredentials(SECRET, creds.username + 'x', creds.credential)).toBe(false);
  });

  it('rejects expired credentials', () => {
    // Generate expired credential (1 second ago)
    const nowUnix = Math.floor(Date.now() / 1000);
    const expiredUsername = `${nowUnix - 10}:p_bob`;
    const creds = generateHmacTurnCredentials(SECRET, 'p_bob', -100);

    const isValid = verifyHmacTurnCredentials(SECRET, expiredUsername, creds.credential);
    expect(isValid).toBe(false);
  });
});

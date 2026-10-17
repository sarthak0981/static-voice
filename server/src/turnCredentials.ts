import crypto from 'node:crypto';

export interface TurnHmacCredentials {
  username: string;
  credential: string;
  expiryUnix: number;
}

/**
 * Generates time-limited HMAC-SHA1 TURN credentials conforming to coturn's
 * `use-auth-secret` / `static-auth-secret` standard.
 * 
 * Username: `<expiryUnix>:<participantId>`
 * Credential: Base64(HMAC-SHA1(secret, username))
 * 
 * @param secret Shared auth secret matching coturn configuration
 * @param participantId Unique participant identifier
 * @param ttlSeconds Credential lifetime (default 7200s / 2 hours)
 */
export function generateHmacTurnCredentials(
  secret: string,
  participantId: string,
  ttlSeconds: number = 7200
): TurnHmacCredentials {
  if (!secret) {
    throw new Error('TURN shared secret cannot be empty');
  }

  const cleanId = (participantId || 'guest').replace(/[^a-zA-Z0-9_\-]/g, '');
  const nowUnix = Math.floor(Date.now() / 1000);
  const expiryUnix = nowUnix + Math.max(60, ttlSeconds);
  const username = `${expiryUnix}:${cleanId}`;

  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const credential = hmac.digest('base64');

  return {
    username,
    credential,
    expiryUnix
  };
}

/**
 * Verifies time-limited HMAC TURN credentials.
 */
export function verifyHmacTurnCredentials(
  secret: string,
  username: string,
  credential: string
): boolean {
  if (!secret || !username || !credential) return false;

  const parts = username.split(':');
  if (parts.length < 2) return false;

  const expiryUnix = parseInt(parts[0], 10);
  if (isNaN(expiryUnix)) return false;

  const nowUnix = Math.floor(Date.now() / 1000);
  if (nowUnix > expiryUnix) return false; // Expired

  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(username);
  const expectedCredential = hmac.digest('base64');

  try {
    const credBuf = Buffer.from(credential);
    const expectedBuf = Buffer.from(expectedCredential);
    if (credBuf.length !== expectedBuf.length) return false;
    return crypto.timingSafeEqual(credBuf, expectedBuf);
  } catch (_) {
    return false;
  }
}

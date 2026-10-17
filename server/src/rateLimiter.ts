import { rateLimitHitsCounter } from './metrics.js';
import { logger } from './logger.js';

export interface TokenBucketConfig {
  capacity: number;
  refillPerSecond: number;
}

export class TokenBucket {
  private tokens: number;
  private lastRefill: number;
  private readonly capacity: number;
  private readonly refillPerSecond: number;

  constructor(config: TokenBucketConfig) {
    this.capacity = config.capacity;
    this.refillPerSecond = config.refillPerSecond;
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  public tryConsume(cost: number = 1): boolean {
    this.refill();
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefill = now;
  }
}

export type RateLimitAction =
  | 'create-room'
  | 'join-room'
  | 'reconnect-session'
  | 'send-party-chat'
  | 'get-ice-config'
  | 'signal-peer'
  | 'toggle-raise-hand'
  | 'host-action';

const ACTION_RULES: Record<RateLimitAction, TokenBucketConfig> = {
  'create-room': { capacity: 3, refillPerSecond: 0.2 },       // 1 creation per 5 seconds
  'join-room': { capacity: 10, refillPerSecond: 1.0 },        // 1 join per second
  'reconnect-session': { capacity: 12, refillPerSecond: 2.0 },// fast reconnect allowance
  'send-party-chat': { capacity: 6, refillPerSecond: 1.5 },   // chat throttle
  'get-ice-config': { capacity: 4, refillPerSecond: 0.5 },    // ICE config throttle
  'signal-peer': { capacity: 70, refillPerSecond: 35.0 },     // WebRTC signaling burst
  'toggle-raise-hand': { capacity: 4, refillPerSecond: 0.5 }, // hand-raise toggle
  'host-action': { capacity: 15, refillPerSecond: 4.0 }       // host moderation actions
};

interface FailedJoinAttempt {
  count: number;
  lockoutUntil: number;
  firstAttemptTime: number;
}

export class RateLimiterManager {
  private buckets: Map<string, TokenBucket> = new Map();
  private failedJoinAttempts: Map<string, FailedJoinAttempt> = new Map();
  private roomsPerIp: Map<string, Set<string>> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Periodically prune stale buckets every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.pruneStaleEntries();
    }, 5 * 60 * 1000);
  }

  /**
   * Checks if an action is permitted under the token bucket algorithm.
   */
  public checkRateLimit(key: string, action: RateLimitAction): boolean {
    const bucketKey = `${action}:${key}`;
    let bucket = this.buckets.get(bucketKey);

    if (!bucket) {
      bucket = new TokenBucket(ACTION_RULES[action]);
      this.buckets.set(bucketKey, bucket);
    }

    const allowed = bucket.tryConsume(1);
    if (!allowed) {
      rateLimitHitsCounter.inc({ action });
      logger.warn({ key, action }, 'Rate limit exceeded');
    }
    return allowed;
  }

  /**
   * Checks if an IP is locked out due to excessive failed room code join attempts.
   */
  public isIpJoinLockedOut(ip: string): { isLocked: boolean; remainingSeconds: number } {
    const attempt = this.failedJoinAttempts.get(ip);
    if (!attempt) return { isLocked: false, remainingSeconds: 0 };

    const now = Date.now();
    if (now < attempt.lockoutUntil) {
      const remainingSeconds = Math.ceil((attempt.lockoutUntil - now) / 1000);
      return { isLocked: true, remainingSeconds };
    }

    return { isLocked: false, remainingSeconds: 0 };
  }

  /**
   * Records a failed room join attempt with exponential lockout.
   */
  public recordFailedJoin(ip: string): void {
    const now = Date.now();
    let attempt = this.failedJoinAttempts.get(ip);

    if (!attempt || now - attempt.firstAttemptTime > 120000) {
      attempt = { count: 1, lockoutUntil: 0, firstAttemptTime: now };
    } else {
      attempt.count++;
    }

    // After 5 failed attempts in 2 minutes, trigger exponential lockout (30s, 60s, 120s...)
    if (attempt.count >= 5) {
      const exponent = attempt.count - 5;
      const lockoutDurationMs = Math.min(300000, 30000 * Math.pow(2, exponent));
      attempt.lockoutUntil = now + lockoutDurationMs;
      logger.warn({ ip, lockoutDurationMs }, 'IP temporarily locked out due to room code brute-force attempts');
    }

    this.failedJoinAttempts.set(ip, attempt);
  }

  /**
   * Resets failed join tracking on successful room join.
   */
  public recordSuccessfulJoin(ip: string): void {
    this.failedJoinAttempts.delete(ip);
  }

  /**
   * Tracks rooms created per IP to prevent room exhaustion abuse.
   */
  public canIpCreateRoom(ip: string, maxPerIp: number): boolean {
    const activeRooms = this.roomsPerIp.get(ip);
    if (!activeRooms) return true;
    return activeRooms.size < maxPerIp;
  }

  public registerRoomCreated(ip: string, roomId: string): void {
    let set = this.roomsPerIp.get(ip);
    if (!set) {
      set = new Set();
      this.roomsPerIp.set(ip, set);
    }
    set.add(roomId);
  }

  public unregisterRoom(ip: string, roomId: string): void {
    const set = this.roomsPerIp.get(ip);
    if (set) {
      set.delete(roomId);
      if (set.size === 0) {
        this.roomsPerIp.delete(ip);
      }
    }
  }

  private pruneStaleEntries(): void {
    const now = Date.now();
    for (const [ip, attempt] of this.failedJoinAttempts.entries()) {
      if (now > attempt.lockoutUntil && now - attempt.firstAttemptTime > 300000) {
        this.failedJoinAttempts.delete(ip);
      }
    }
  }

  public destroy(): void {
    clearInterval(this.cleanupInterval);
    this.buckets.clear();
    this.failedJoinAttempts.clear();
    this.roomsPerIp.clear();
  }
}

export const rateLimiter = new RateLimiterManager();

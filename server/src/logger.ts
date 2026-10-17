import pino from 'pino';
import { config } from './config.js';

export const logger = pino({
  level: config.LOG_LEVEL,
  redact: {
    paths: [
      'sessionToken',
      'token',
      'signal.sdp',
      'signal',
      'text',
      'chatText',
      'credential',
      'password',
      '*.sessionToken',
      '*.signal',
      '*.text'
    ],
    censor: '[REDACTED]'
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'static-voice-server',
    env: config.NODE_ENV
  }
});

/**
 * Creates a scoped child logger with tracking IDs.
 */
export function createScopedLogger(context: {
  socketId?: string;
  roomId?: string;
  participantId?: string;
}) {
  return logger.child(context);
}

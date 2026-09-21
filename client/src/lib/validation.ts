import { evaluateTextSafety, SafetyEvaluation } from './safety.js';

export const MAX_USERNAME_LENGTH = 24;
export const MAX_ROOM_NAME_LENGTH = 40;
export const USERNAME_REGEX = /^[a-zA-Z0-9_\- ]+$/;
export const ROOM_CODE_REGEX = /^[2-9A-Z]{5,8}$/;

export interface ClientValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
  safety?: SafetyEvaluation;
}

export function validateUsername(rawName: string): ClientValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return { isValid: false, normalized: '', error: 'Please enter a username.' };
  }

  const normalized = rawName.trim().replace(/\s+/g, ' ');

  if (normalized.length === 0) {
    return { isValid: false, normalized: '', error: 'Username cannot be blank.' };
  }

  if (normalized.length > MAX_USERNAME_LENGTH) {
    return {
      isValid: false,
      normalized,
      error: `Username must be ${MAX_USERNAME_LENGTH} characters or less.`
    };
  }

  if (!USERNAME_REGEX.test(normalized)) {
    return {
      isValid: false,
      normalized,
      error: 'Only letters, numbers, spaces, underscores, and hyphens are allowed.'
    };
  }

  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(normalized)) {
    return { isValid: false, normalized, error: 'Unsupported characters detected.' };
  }

  // Evaluate against Community Safety Guidelines
  const safety = evaluateTextSafety(normalized, 'username');
  if (!safety.isSafe) {
    return {
      isValid: false,
      normalized,
      error: safety.policyViolation || 'Username violates Community Safety Guidelines.',
      safety
    };
  }

  return { isValid: true, normalized };
}

export function validateRoomName(rawName: string): ClientValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return { isValid: true, normalized: 'STATIC Party' };
  }

  const normalized = rawName.trim().replace(/\s+/g, ' ');

  // Empty room names default to "STATIC Party"
  if (normalized.length === 0) {
    return { isValid: true, normalized: 'STATIC Party' };
  }

  if (normalized.length > MAX_ROOM_NAME_LENGTH) {
    return {
      isValid: false,
      normalized,
      error: `Room name must be ${MAX_ROOM_NAME_LENGTH} characters or less.`
    };
  }

  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(normalized)) {
    return { isValid: false, normalized, error: 'Unsupported characters detected.' };
  }

  // Evaluate against Community Safety Guidelines
  const safety = evaluateTextSafety(normalized, 'room_name');
  if (!safety.isSafe) {
    return {
      isValid: false,
      normalized,
      error: safety.policyViolation || 'Room name violates Community Safety Guidelines.',
      safety
    };
  }

  return { isValid: true, normalized };
}

export function validateRoomCode(rawCode: string): ClientValidationResult {
  if (!rawCode || typeof rawCode !== 'string') {
    return { isValid: false, normalized: '', error: 'Please enter a room code.' };
  }

  const normalized = rawCode.trim().replace(/\s+/g, '').toUpperCase();

  if (normalized.length === 0) {
    return { isValid: false, normalized: '', error: 'Please enter a room code.' };
  }

  if (normalized.length < 5 || normalized.length > 8) {
    return { isValid: false, normalized, error: 'That code is invalid. Code must be 5 to 8 characters.' };
  }

  if (!ROOM_CODE_REGEX.test(normalized)) {
    return { isValid: false, normalized, error: 'That code is invalid. Check characters and try again.' };
  }

  return { isValid: true, normalized };
}

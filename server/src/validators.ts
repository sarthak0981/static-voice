/**
 * Centralized validation, sanitization, and safety checks for STATIC voice platform
 */
import { evaluateTextSafety, SafetyEvaluation } from './safety.js';

export const MAX_USERNAME_LENGTH = 24;
export const MAX_ROOM_NAME_LENGTH = 40;
export const USERNAME_REGEX = /^[a-zA-Z0-9_\- ]+$/;
export const ROOM_CODE_REGEX = /^[2-9A-Z]{5,8}$/;

export interface ValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
  safety?: SafetyEvaluation;
}

export function validateAndSanitizeUsername(rawName: string): ValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return { isValid: false, normalized: '', error: 'Please enter a username.' };
  }

  // Trim and collapse multiple consecutive whitespace characters into a single space
  const normalized = rawName.trim().replace(/\s+/g, ' ');

  if (normalized.length === 0) {
    return { isValid: false, normalized: '', error: 'Username cannot be empty or spaces only.' };
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

  // Reject control characters or zero-width spaces
  if (/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/.test(normalized)) {
    return { isValid: false, normalized, error: 'Unsupported characters detected.' };
  }

  // Community Safety Guidelines verification
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

export function validateAndSanitizeRoomName(rawName?: string): ValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return { isValid: true, normalized: 'STATIC Party' };
  }

  const normalized = rawName.trim().replace(/\s+/g, ' ');

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

  // Community Safety Guidelines verification
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

export function validateAndSanitizeRoomCode(rawCode: string): ValidationResult {
  if (!rawCode || typeof rawCode !== 'string') {
    return { isValid: false, normalized: '', error: 'Please enter a room code.' };
  }

  // Remove internal and surrounding whitespace, convert to uppercase
  const normalized = rawCode.trim().replace(/\s+/g, '').toUpperCase();

  if (normalized.length === 0) {
    return { isValid: false, normalized: '', error: 'Please enter a room code.' };
  }

  if (normalized.length < 5 || normalized.length > 8) {
    return { isValid: false, normalized, error: 'Room codes are between 5 and 8 characters.' };
  }

  if (!ROOM_CODE_REGEX.test(normalized)) {
    return { isValid: false, normalized, error: 'That code contains invalid characters.' };
  }

  return { isValid: true, normalized };
}

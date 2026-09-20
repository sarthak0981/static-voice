/**
 * Centralized validation and sanitization for STATIC voice platform
 */

export const MAX_USERNAME_LENGTH = 24;
export const USERNAME_REGEX = /^[a-zA-Z0-9_\- ]+$/;
export const ROOM_CODE_REGEX = /^[2-9A-Z]{5,8}$/;

export interface ValidationResult {
  isValid: boolean;
  normalized: string;
  error?: string;
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

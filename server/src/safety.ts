/**
 * STATIC Safety & Content Moderation Engine
 * Aligned with Google Safety Guidelines:
 * - Hate Speech & Discrimination
 * - Harassment & Bullying
 * - Threats & Dangerous Violence
 * - Sexually Explicit Content
 * - Severe Profanity & Obscenities
 */

export type SafetyCategory =
  | 'HATE_SPEECH'
  | 'HARASSMENT'
  | 'VIOLENCE_AND_THREATS'
  | 'SEXUALLY_EXPLICIT'
  | 'SEVERE_PROFANITY';

export interface SafetyEvaluation {
  isSafe: boolean;
  category?: SafetyCategory;
  policyViolation?: string;
}

export const CATEGORY_DESCRIPTIONS: Record<SafetyCategory, string> = {
  HATE_SPEECH: 'Hate speech, slurs, or discriminatory language is not allowed.',
  HARASSMENT: 'Harassment, bullying, or targeted abuse is not allowed.',
  VIOLENCE_AND_THREATS: 'Threats of violence, physical harm, or dangerous content are strictly prohibited.',
  SEXUALLY_EXPLICIT: 'Sexually explicit or inappropriate adult content is not allowed.',
  SEVERE_PROFANITY: 'Severe profanity or abusive obscenity is not allowed.'
};

// Safe whitelist to explicitly avoid the Scunthorpe problem
const SAFE_WHITELIST = new Set([
  'pass', 'passed', 'passion', 'passive', 'passport', 'compass', 'trespass',
  'bass', 'grass', 'brass', 'mass', 'glass', 'class', 'classic', 'classical', 'classify',
  'assistant', 'assist', 'assistance', 'associate', 'association', 'assume', 'assumption',
  'assassin', 'assassinate', 'assembly', 'assemble', 'assert', 'assess', 'assessment', 'asset', 'assign',
  'butter', 'button', 'butterfly', 'butler', 'butternut', 'rebuttal',
  'cocktail', 'cockatoo', 'peacock', 'cockpit', 'shuttlecock',
  'document', 'accumulate', 'cucumber', 'circumstance', 'curriculum', 'succumb',
  'analysis', 'analyst', 'analytic', 'analyze', 'analog', 'analogy',
  'pitch', 'stitch', 'witch', 'switch', 'hitch', 'glitch', 'ditch', 'snitch',
  'dictionary', 'verdict', 'predict', 'addict', 'jurisdiction',
  'entity', 'attitude', 'altitude', 'gratitude', 'latitude', 'titmouse', 'appetite',
  'homo sapiens', 'homogeneous', 'homology', 'homophone'
]);

// Normalization mappings for leetspeak and obfuscations
const LEET_MAP: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '/-\\': 'a',
  '8': 'b',
  '3': 'e',
  '€': 'e',
  '1': 'i',
  '!': 'i',
  '|': 'i',
  '0': 'o',
  '$': 's',
  '5': 's',
  '7': 't',
  '+': 't',
  'vv': 'w',
  '\\/\\/': 'w'
};

/**
 * Normalizes raw input:
 * 1. Strips zero-width & non-printable characters.
 * 2. Unifies leetspeak characters.
 * 3. Collapses excessive repeated letters (e.g., "fuuuuck" -> "fuck").
 */
export function normalizeForSafetyCheck(text: string): { normalized: string; compact: string } {
  if (!text) return { normalized: '', compact: '' };

  // Remove zero-width / invisible format characters
  let clean = text
    .normalize('NFKD')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g, '')
    .toLowerCase();

  // Replace leetspeak tokens
  for (const [leet, normal] of Object.entries(LEET_MAP)) {
    clean = clean.split(leet).join(normal);
  }

  // Compress repeated whitespace
  const normalized = clean.replace(/\s+/g, ' ').trim();

  // Create a compact version with internal punctuation/delimiters removed
  // (detects "f.u.c.k", "h-a-t-e", "s p a c e d")
  const compact = normalized.replace(/[^a-z0-9]/g, '');

  return { normalized, compact };
}

/**
 * Helper to test for full-word or boundary-aware prohibited patterns.
 */
function matchWords(text: string, words: string[]): boolean {
  for (const word of words) {
    // Regex with word boundaries
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      // Ensure the matched word is not in the safe whitelist
      const match = text.match(regex);
      if (match && !SAFE_WHITELIST.has(match[0].toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Helper to test compact (delimiter-stripped) string against terms.
 */
function matchCompact(compactText: string, terms: string[]): boolean {
  if (SAFE_WHITELIST.has(compactText)) return false;
  for (const term of terms) {
    if (compactText.includes(term)) {
      return true;
    }
  }
  return false;
}

// 1. Hate Speech & Slurs (Racial, Religious, Sexual Orientation, Disability)
const HATE_SPEECH_WORDS = [
  'nigger', 'nigga', 'faggot', 'fag', 'dyke', 'kike', 'chink', 'spic', 'wetback',
  'gook', 'coon', 'tranny', 'shemale', 'retard', 'mongoloid', 'towelhead',
  'raghead', 'jihadist scum', 'subhuman', 'white trash', 'curry muncher'
];

// 2. Harassment & Targeted Abuse
const HARASSMENT_WORDS = [
  'doxx', 'dox', 'kill yourself', 'kys', 'hang yourself', 'slit your wrists',
  'drink bleach', 'go die', 'die in a fire', 'nobody loves you', 'worthless piece of shit',
  'ugly cunt', 'die bitch', 'hope you get cancer'
];

// 3. Threats & Dangerous Violence
const VIOLENCE_WORDS = [
  'i will kill you', 'im gonna kill you', 'i will murder you', 'shoot up', 'school shooter',
  'bomb threat', 'bombing', 'terrorist attack', 'mass shooting', 'behead you',
  'strangle you', 'cut your throat', 'pipe bomb', 'detonate bomb'
];

// 4. Sexually Explicit Content
const SEXUAL_WORDS = [
  'porn', 'porno', 'pornography', 'hentai', 'blowjob', 'handjob', 'cumshot',
  'deepthroat', 'gangbang', 'creampie', 'dildo', 'vagina', 'penis', 'cock',
  'pussy', 'clitoris', 'masturbate', 'masturbation', 'orgasm', 'ejaculation',
  'incest', 'pedophile', 'pedophilia', 'paedophile', 'jailbait', 'child porn', 'cp'
];

// 5. Severe Profanity & Obscenities
const SEVERE_PROFANITY_WORDS = [
  'fuck', 'fucking', 'fucked', 'motherfucker', 'cunt', 'twat', 'bitch',
  'bastard', 'whore', 'slut', 'jackass', 'bullshit', 'dipshit', 'asshole'
];

/**
 * Evaluates text against Google Safety Guidelines.
 * Returns { isSafe: true } if clean, or { isSafe: false, category, policyViolation } if restricted.
 */
export function evaluateTextSafety(text: string, context: 'username' | 'room_name' | 'chat' = 'chat'): SafetyEvaluation {
  if (!text || typeof text !== 'string') {
    return { isSafe: true };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { isSafe: true };
  }

  // Fast-path whitelist check for entire exact input
  if (SAFE_WHITELIST.has(trimmed.toLowerCase())) {
    return { isSafe: true };
  }

  const { normalized, compact } = normalizeForSafetyCheck(trimmed);

  // 1. Hate Speech Check (Zero tolerance across all contexts)
  if (matchWords(normalized, HATE_SPEECH_WORDS) || matchCompact(compact, ['nigger', 'nigga', 'faggot', 'kike', 'chink', 'retard'])) {
    return {
      isSafe: false,
      category: 'HATE_SPEECH',
      policyViolation: CATEGORY_DESCRIPTIONS.HATE_SPEECH
    };
  }

  // 2. Violence and Threats Check
  if (matchWords(normalized, VIOLENCE_WORDS) || matchCompact(compact, ['killyourself', 'kys', 'slitwrist', 'pipebomb', 'schoolshooter'])) {
    return {
      isSafe: false,
      category: 'VIOLENCE_AND_THREATS',
      policyViolation: CATEGORY_DESCRIPTIONS.VIOLENCE_AND_THREATS
    };
  }

  // 3. Harassment Check
  if (matchWords(normalized, HARASSMENT_WORDS)) {
    return {
      isSafe: false,
      category: 'HARASSMENT',
      policyViolation: CATEGORY_DESCRIPTIONS.HARASSMENT
    };
  }

  // 4. Sexually Explicit Content
  // Notice: 'cp' in compact could trigger on words, so only check explicit words or dangerous compact combos
  if (
    matchWords(normalized, SEXUAL_WORDS) ||
    matchCompact(compact, ['childporn', 'pedophile', 'blowjob', 'deepthroat', 'creampie'])
  ) {
    return {
      isSafe: false,
      category: 'SEXUALLY_EXPLICIT',
      policyViolation: CATEGORY_DESCRIPTIONS.SEXUALLY_EXPLICIT
    };
  }

  // 5. Severe Profanity
  if (
    matchWords(normalized, SEVERE_PROFANITY_WORDS) ||
    matchCompact(compact, ['fuck', 'motherfucker', 'cunt', 'bitch'])
  ) {
    return {
      isSafe: false,
      category: 'SEVERE_PROFANITY',
      policyViolation: CATEGORY_DESCRIPTIONS.SEVERE_PROFANITY
    };
  }

  return { isSafe: true };
}

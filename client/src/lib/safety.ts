/**
 * STATIC Safety & Content Moderation Engine (Client)
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

export const CATEGORY_LABELS: Record<SafetyCategory, string> = {
  HATE_SPEECH: 'Hate Speech & Discrimination',
  HARASSMENT: 'Harassment & Bullying',
  VIOLENCE_AND_THREATS: 'Violence & Threats',
  SEXUALLY_EXPLICIT: 'Sexually Explicit Content',
  SEVERE_PROFANITY: 'Severe Profanity'
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

// Homoglyphs map (Cyrillic & Greek lookalikes to Latin letters)
const HOMOGLYPH_MAP: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'е': 'e', 'ё': 'e', 'ж': 'zh',
  'з': 'z', 'и': 'i', 'і': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 'c', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'x', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
  'ы': 'y', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'α': 'a', 'β': 'b', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'h',
  'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x',
  'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'u',
  'φ': 'ph', 'χ': 'ch', 'ψ': 'ps', 'ω': 'o'
};

/**
 * Normalizes raw input:
 * 1. NFKC Unicode normalization.
 * 2. Strips zero-width & non-printable characters.
 * 3. Maps Cyrillic/Greek homoglyphs to Latin.
 * 4. Unifies leetspeak tokens.
 * 5. Collapses excessive repeated letters (e.g. "fuuuuck" -> "fuck").
 */
export function normalizeForSafetyCheck(text: string): { normalized: string; compact: string } {
  if (!text) return { normalized: '', compact: '' };

  // 1. Unicode NFKC normalization
  let clean = text.normalize('NFKC');

  // 2. Strip zero-width, non-printable, and directional overrides
  clean = clean.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, '').toLowerCase();

  // 3. Replace homoglyphs
  for (const [homo, latin] of Object.entries(HOMOGLYPH_MAP)) {
    if (clean.includes(homo)) {
      clean = clean.split(homo).join(latin);
    }
  }

  // 4. Replace leetspeak tokens
  for (const [leet, normal] of Object.entries(LEET_MAP)) {
    clean = clean.split(leet).join(normal);
  }

  // 5. Collapse 3+ repeated characters down to 1
  const collapsed = clean.replace(/(.)\1{2,}/g, '$1');

  // Compress repeated whitespace
  const normalized = collapsed.replace(/\s+/g, ' ').trim();

  // Create a compact version with internal punctuation/delimiters removed
  const compact = normalized.replace(/[^a-z0-9]/g, '');

  return { normalized, compact };
}

function matchWords(text: string, words: string[]): boolean {
  for (const word of words) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'i');
    if (regex.test(text)) {
      const match = text.match(regex);
      if (match && !SAFE_WHITELIST.has(match[0].toLowerCase())) {
        return true;
      }
    }
  }
  return false;
}

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
export function evaluateTextSafety(text: string, _context: 'username' | 'room_name' | 'chat' = 'chat'): SafetyEvaluation {
  if (!text || typeof text !== 'string') {
    return { isSafe: true };
  }

  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return { isSafe: true };
  }

  if (SAFE_WHITELIST.has(trimmed.toLowerCase())) {
    return { isSafe: true };
  }

  const { normalized, compact } = normalizeForSafetyCheck(trimmed);

  // 1. Hate Speech Check
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

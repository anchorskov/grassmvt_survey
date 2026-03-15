// src/lib/townhall-moderation.js

const DEFAULT_PROVIDER = 'heuristic';
const DEFAULT_REVISE_SCORE = 2;
const DEFAULT_BLOCK_SCORE = 4;
const TOWNHALL_STATEMENT_QUALITY_MESSAGE =
  'Please add a complete thought, not just a few words. Aim for at least one clear sentence.';
const MIN_QUALITY_CHARS = 40;
const MIN_QUALITY_WORDS = 6;
const LOW_QUALITY_FILLER_WORDS = new Set([
  'a',
  'asdf',
  'cool',
  'fine',
  'good',
  'great',
  'hello',
  'hi',
  'hmm',
  'k',
  'kk',
  'lol',
  'nah',
  'no',
  'nope',
  'ok',
  'okay',
  'sure',
  'test',
  'testing',
  'thanks',
  'whatever',
  'word',
  'yes',
  'yep',
]);

const BLOCK_PATTERNS = [
  { flag: 'threat', pattern: /\b(i(?:'| a)?ll|i am going to|im gonna)\s+(kill|hurt|beat|shoot|stab|attack)\b/i, reason: 'threatening language' },
  { flag: 'threat', pattern: /\bkill yourself\b/i, reason: 'threatening language' },
  { flag: 'harassment', pattern: /\bgo die\b/i, reason: 'harassing language' },
  { flag: 'slur', pattern: /\b(nigg(?:er|a)|faggot|kike|spic|chink)\b/i, reason: 'hateful language' },
];

const REVISE_PATTERNS = [
  { flag: 'abuse', score: 2, pattern: /\b(you('| a)?re|ur|you sound like)\s+(an?\s+)?(idiot|moron|stupid|dumb|trash|garbage|clown|loser|liar|coward)\b/i, reason: 'personal attack' },
  { flag: 'abuse', score: 2, pattern: /\b(shut up|screw you|fuck you)\b/i, reason: 'hostile language' },
  { flag: 'profanity', score: 1, pattern: /\b(fuck|shit|bullshit|asshole|bitch|bastard|damn you)\b/i, reason: 'profane language' },
];

const parseBoolean = (value, fallback) => {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeModerationInput = (text, tags = []) =>
  `${String(text || '').trim()} ${Array.isArray(tags) ? tags.join(' ') : ''}`
    .trim()
    .replace(/\s+/g, ' ');

const getWords = (text) =>
  String(text || '')
    .toLowerCase()
    .match(/[a-z]+(?:'[a-z]+)?/g) || [];

const looksLikeUrlOnlySubmission = (text) => {
  const withoutUrls = String(text || '')
    .replace(/https?:\/\/\S+/gi, ' ')
    .trim();
  return !withoutUrls;
};

export const validateTownhallStatementQuality = (text = '') => {
  const input = String(text || '').trim();
  const letters = (input.match(/[a-z]/gi) || []).length;
  const spaces = (input.match(/\s/g) || []).length;
  const words = getWords(input);
  const uniqueWords = new Set(words);
  const nonPunctuationChars = input.replace(/[\s\p{P}\p{S}]+/gu, '');

  if (!input) {
    return { ok: false, code: 'empty', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (input.length < MIN_QUALITY_CHARS) {
    return { ok: false, code: 'too_short', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (words.length < MIN_QUALITY_WORDS) {
    return { ok: false, code: 'too_few_words', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (letters < 12 || spaces < 1) {
    return { ok: false, code: 'not_natural_language', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (!/[a-z]/i.test(input) || !/\s/.test(input)) {
    return { ok: false, code: 'not_sentence_like', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (!nonPunctuationChars || /^\d+$/.test(nonPunctuationChars)) {
    return { ok: false, code: 'numbers_or_symbols_only', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (looksLikeUrlOnlySubmission(input)) {
    return { ok: false, code: 'url_only', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (/(.)\1{5,}/i.test(input)) {
    return { ok: false, code: 'repeated_characters', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }

  const symbolChars = (input.match(/[^\w\s]/g) || []).length;
  if (symbolChars > letters && letters < 20) {
    return { ok: false, code: 'mostly_symbols', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }

  const fillerWords = words.filter((word) => LOW_QUALITY_FILLER_WORDS.has(word));
  if (words.length <= 3) {
    return { ok: false, code: 'too_brief', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (fillerWords.length === words.length) {
    return { ok: false, code: 'filler_only', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }
  if (uniqueWords.size <= 2 && words.length >= 4) {
    return { ok: false, code: 'low_variety', message: TOWNHALL_STATEMENT_QUALITY_MESSAGE };
  }

  return {
    ok: true,
    code: 'ok',
    message: '',
    stats: {
      chars: input.length,
      words: words.length,
      uniqueWords: uniqueWords.size,
    },
  };
};

const buildHeuristicResult = (normalizedInput, config) => {
  const flags = [];
  const reasons = [];
  let score = 0;

  for (const entry of BLOCK_PATTERNS) {
    if (entry.pattern.test(normalizedInput)) {
      flags.push(entry.flag);
      reasons.push(entry.reason);
      score = Math.max(score, config.blockScore);
    }
  }

  for (const entry of REVISE_PATTERNS) {
    if (entry.pattern.test(normalizedInput)) {
      flags.push(entry.flag);
      reasons.push(entry.reason);
      score += entry.score;
    }
  }

  const letters = normalizedInput.replace(/[^a-z]/gi, '');
  if (letters.length >= 24) {
    const uppercaseCount = (normalizedInput.match(/[A-Z]/g) || []).length;
    if (uppercaseCount / letters.length > 0.55) {
      flags.push('shouting');
      reasons.push('excessive all-caps');
      score += 1;
    }
  }

  if (/!{3,}|\?{3,}/.test(normalizedInput)) {
    flags.push('aggressive_formatting');
    reasons.push('aggressive punctuation');
    score += 1;
  }

  const uniqueFlags = [...new Set(flags)];
  const uniqueReasons = [...new Set(reasons)];

  let outcome = 'pass';
  if (score >= config.blockScore || uniqueFlags.includes('threat') || uniqueFlags.includes('slur')) {
    outcome = 'block';
  } else if (score >= config.reviseScore) {
    outcome = 'revise';
  }

  return {
    outcome,
    provider: DEFAULT_PROVIDER,
    score,
    flags: uniqueFlags,
    reason: uniqueReasons.join(', ') || '',
  };
};

export const getTownhallModerationConfig = (env = {}) => ({
  enabled: parseBoolean(env.TOWNHALL_MODERATION_ENABLED, true),
  provider: String(env.TOWNHALL_MODERATION_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase() || DEFAULT_PROVIDER,
  reviseScore: parsePositiveInt(env.TOWNHALL_MODERATION_REVISE_SCORE, DEFAULT_REVISE_SCORE),
  blockScore: parsePositiveInt(env.TOWNHALL_MODERATION_BLOCK_SCORE, DEFAULT_BLOCK_SCORE),
  submitLimitPer10Min: parsePositiveInt(env.TOWNHALL_SUBMIT_LIMIT_PER_10_MIN, 5),
});

export const moderateTownhallStatement = async ({ env = {}, text = '', tags = [] } = {}) => {
  const config = getTownhallModerationConfig(env);
  if (!config.enabled) {
    return {
      outcome: 'pass',
      provider: 'disabled',
      score: 0,
      flags: [],
      reason: '',
    };
  }

  const normalizedInput = normalizeModerationInput(text, tags);
  if (!normalizedInput) {
    return {
      outcome: 'revise',
      provider: config.provider,
      score: config.reviseScore,
      flags: ['empty'],
      reason: 'empty content',
    };
  }

  if (config.provider !== DEFAULT_PROVIDER) {
    return buildHeuristicResult(normalizedInput, config);
  }

  return buildHeuristicResult(normalizedInput, config);
};

export { TOWNHALL_STATEMENT_QUALITY_MESSAGE };

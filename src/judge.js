const DEFAULT_ALLOWED = new Set(['-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

function extractAnswerChars(answerValue) {
  if (answerValue === null || answerValue === undefined) {
    return '';
  }
  if (typeof answerValue === 'number') {
    return String(answerValue);
  }
  if (typeof answerValue === 'string') {
    return answerValue;
  }
  if (typeof answerValue === 'object') {
    if (Array.isArray(answerValue.chars)) {
      return answerValue.chars.join('');
    }
    if (typeof answerValue.raw === 'string') {
      return answerValue.raw;
    }
  }
  return '';
}

function buildAllowedSet(question) {
  if (question.blank_rules && Array.isArray(question.blank_rules.allowed_chars)) {
    return new Set(question.blank_rules.allowed_chars);
  }
  return DEFAULT_ALLOWED;
}

function expandGroup(groupKey, value, errors, context) {
  const expected = extractAnswerChars(value);
  if (!expected && expected !== '') {
    errors.push({
      code: 'ANSWER_VALUE_INVALID',
      message: 'Answer value is empty',
      ...context
    });
    return null;
  }
  if (expected.length !== groupKey.length) {
    errors.push({
      code: 'ANSWER_LENGTH_MISMATCH',
      message: `Answer length ${expected.length} does not match group length ${groupKey.length}`,
      ...context
    });
    return null;
  }
  const map = new Map();
  for (let i = 0; i < groupKey.length; i += 1) {
    map.set(groupKey[i], expected[i]);
  }
  return map;
}

function validateUserInput(groups, allowed, errors) {
  for (const [groupKey, value] of Object.entries(groups)) {
    if (typeof value !== 'string') {
      errors.push({
        code: 'USER_ANSWER_INVALID',
        message: `Answer for ${groupKey} must be a string`
      });
      continue;
    }
    if (value.length !== groupKey.length) {
      errors.push({
        code: 'USER_ANSWER_LENGTH_MISMATCH',
        message: `Answer length ${value.length} does not match group length ${groupKey.length}`
      });
    }
    for (const ch of value) {
      if (!allowed.has(ch)) {
        errors.push({
          code: 'USER_ANSWER_CHAR_INVALID',
          message: `Invalid character '${ch}' in ${groupKey}`
        });
        break;
      }
    }
  }
}

function gradeAttempt(question, correctGroups, userGroups) {
  const errors = [];
  const allowed = buildAllowedSet(question);
  const perBlank = {};

  if (!userGroups || typeof userGroups !== 'object') {
    return {
      errors: [{ code: 'USER_ANSWER_MISSING', message: 'answers_user is required' }]
    };
  }

  validateUserInput(userGroups, allowed, errors);

  const expectedPerBlank = new Map();
  for (const [groupKey, value] of Object.entries(correctGroups)) {
    const map = expandGroup(groupKey, value, errors, { group: groupKey });
    if (!map) {
      continue;
    }
    for (const [blank, ch] of map.entries()) {
      expectedPerBlank.set(blank, ch);
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const seenUserBlanks = new Set();
  for (const [groupKey, value] of Object.entries(userGroups)) {
    const map = expandGroup(groupKey, value, errors, { group: groupKey });
    if (!map) {
      continue;
    }
    for (const [blank, ch] of map.entries()) {
      seenUserBlanks.add(blank);
      const expected = expectedPerBlank.get(blank);
      const isCorrect = expected === ch;
      perBlank[blank] = {
        expected: expected ?? null,
        actual: ch,
        is_correct: isCorrect
      };
    }
  }

  for (const [blank, expected] of expectedPerBlank.entries()) {
    if (!perBlank[blank]) {
      perBlank[blank] = {
        expected,
        actual: null,
        is_correct: false
      };
    }
  }

  for (const blank of seenUserBlanks) {
    if (!expectedPerBlank.has(blank)) {
      errors.push({
        code: 'USER_ANSWER_EXTRA',
        message: `Unexpected blank '${blank}' in user answers`
      });
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  const isCorrect = Object.values(perBlank).every((entry) => entry.is_correct);
  return { errors: [], perBlank, isCorrect };
}

function normalizeAnswers(groups) {
  const normalized = {};
  for (const [groupKey, value] of Object.entries(groups)) {
    normalized[groupKey] = extractAnswerChars(value);
  }
  return normalized;
}

module.exports = { gradeAttempt, normalizeAnswers };

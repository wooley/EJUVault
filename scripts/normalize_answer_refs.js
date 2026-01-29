const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(process.cwd(), 'content');
const QUESTIONS_DIR = path.join(CONTENT_DIR, 'questions');
const NORMALIZED_ANSWERS_PATH = path.join(CONTENT_DIR, 'answers', 'normalized.json');

function listFiles(dir, ext) {
  if (!fs.existsSync(dir)) {
    return [];
  }
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith('.')) {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, ext));
    } else if (!ext || entry.name.endsWith(ext)) {
      files.push(fullPath);
    }
  }
  return files;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function isAnswerValue(value) {
  if (value === null || value === undefined) {
    return false;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    return true;
  }
  if (typeof value === 'object') {
    return Array.isArray(value.chars) || typeof value.raw === 'string';
  }
  return false;
}

function isInlineAnswerMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  const reserved = new Set(['course', 'section', 'q', 'sub', 'group', 'path', 'key', 'ref', 'source', 'question_number']);
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return false;
  }
  if (keys.some((key) => reserved.has(key))) {
    return false;
  }
  return keys.every((key) => isAnswerValue(obj[key]));
}

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

function normalizeAnswerMap(answerMap) {
  const normalized = {};
  for (const [key, value] of Object.entries(answerMap)) {
    normalized[key] = extractAnswerChars(value);
  }
  return normalized;
}

function deriveQuestionNumber(question) {
  const raw = question.question_number ?? question.number ?? question.question_no ?? question.order;
  if (raw !== null && raw !== undefined) {
    return raw;
  }
  if (typeof question.question_id === 'string') {
    const match = question.question_id.match(/-(\d+)$/);
    if (match) {
      return Number(match[1]);
    }
  }
  return null;
}

function deriveQuestionRef(question) {
  const course = question.course;
  const section = question.section;
  const rawNumber = deriveQuestionNumber(question);
  let q = null;
  if (typeof rawNumber === 'string') {
    const trimmed = rawNumber.trim();
    if (trimmed.startsWith('Q') || trimmed.startsWith('問')) {
      q = trimmed;
    } else if (trimmed) {
      q = `Q${trimmed}`;
    }
  } else if (Number.isFinite(rawNumber)) {
    q = `Q${rawNumber}`;
  }
  if (!q && typeof question.question_id === 'string') {
    q = question.question_id;
  }
  return { course, section, q };
}

function normalizeAnswerRef(question, normalizedAnswers) {
  if (!question || typeof question !== 'object') {
    return false;
  }
  const answerRef = question.answer_ref;
  if (!answerRef) {
    return false;
  }
  const baseRef = deriveQuestionRef(question);
  let changed = false;

  if (typeof answerRef === 'string') {
    question.answer_ref = { ...baseRef, ref: answerRef };
    return true;
  }

  if (isInlineAnswerMap(answerRef)) {
    normalizedAnswers[question.question_id] = normalizeAnswerMap(answerRef);
    question.answer_ref = { ...baseRef };
    return true;
  }

  if (typeof answerRef === 'object' && !Array.isArray(answerRef)) {
    if (!answerRef.course && baseRef.course !== undefined) {
      answerRef.course = baseRef.course;
      changed = true;
    }
    if (!answerRef.section && baseRef.section !== undefined) {
      answerRef.section = baseRef.section;
      changed = true;
    }
    if (!answerRef.q && baseRef.q) {
      answerRef.q = baseRef.q;
      changed = true;
    }
  }

  return changed;
}

function loadNormalizedAnswers() {
  if (fs.existsSync(NORMALIZED_ANSWERS_PATH)) {
    try {
      return readJson(NORMALIZED_ANSWERS_PATH);
    } catch (error) {
      return null;
    }
  }
  return null;
}

function main() {
  const files = listFiles(QUESTIONS_DIR, '.json');
  const normalizedPayload = loadNormalizedAnswers() || { schema_version: 'v1', generated_at: null, answers: {} };
  if (!normalizedPayload.answers || typeof normalizedPayload.answers !== 'object') {
    normalizedPayload.answers = {};
  }

  let updatedQuestions = 0;
  let normalizedUpdates = 0;

  files.forEach((filePath) => {
    const data = readJson(filePath);
    const before = JSON.stringify(data);
    const beforeAnswers = JSON.stringify(normalizedPayload.answers);
    const changed = normalizeAnswerRef(data, normalizedPayload.answers);
    const after = JSON.stringify(data);
    if (changed && before !== after) {
      writeJson(filePath, data);
      updatedQuestions += 1;
    }
    if (beforeAnswers !== JSON.stringify(normalizedPayload.answers)) {
      normalizedUpdates += 1;
    }
  });

  if (normalizedUpdates > 0) {
    normalizedPayload.generated_at = new Date().toISOString();
    writeJson(NORMALIZED_ANSWERS_PATH, normalizedPayload);
  }

  console.log(`Updated answer_ref in ${updatedQuestions}/${files.length} question files.`);
  console.log(`Normalized answers updated: ${normalizedUpdates > 0 ? 'yes' : 'no'}.`);
}

main();

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(process.cwd(), 'content');
const QUESTION_INDEX = path.join(CONTENT_DIR, 'index', 'question_index.json');
const OUTPUT_PATH = path.join(CONTENT_DIR, 'answers', 'normalized.json');

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

function normalizeSubKey(sub) {
  if (!sub || typeof sub !== 'string') {
    return null;
  }
  const trimmed = sub.trim();
  if (!trimmed) {
    return null;
  }
  const match = trimmed.match(/^\((\d+)\)$/);
  if (match) {
    return match[1];
  }
  return trimmed;
}

function isAnswerGroupMap(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return false;
  }
  const keys = Object.keys(obj);
  if (keys.length === 0) {
    return false;
  }
  return keys.every((key) => {
    const value = obj[key];
    if (value === null || value === undefined) {
      return false;
    }
    if (typeof value === 'number' || typeof value === 'string') {
      return true;
    }
    if (typeof value === 'object') {
      return 'raw' in value || 'chars' in value;
    }
    return false;
  });
}

function mergeAnswerGroups(container) {
  if (isAnswerGroupMap(container)) {
    return container;
  }
  if (!container || typeof container !== 'object') {
    return null;
  }
  const merged = {};
  let found = false;
  for (const value of Object.values(container)) {
    if (isAnswerGroupMap(value)) {
      Object.assign(merged, value);
      found = true;
    }
  }
  return found ? merged : null;
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

function buildAnswerSources(answerDir) {
  const answerFiles = listFiles(answerDir, '.json').filter((file) => !file.includes('ai_ans') && !file.endsWith('normalized.json'));
  const sourcesByExam = new Map();
  for (const file of answerFiles) {
    const data = readJson(file);
    const examId = path.basename(path.dirname(file));
    if (!sourcesByExam.has(examId)) {
      sourcesByExam.set(examId, []);
    }
    sourcesByExam.get(examId).push({ data, file });
  }
  return sourcesByExam;
}

function resolveAnswerGroups(question, sources) {
  if (!sources) {
    return null;
  }
  const questionId = question.question_id;
  const answerRef = question.answer_ref || {};
  const section = answerRef.section || question.section;
  const qRaw = answerRef.q || (answerRef.question_number ? `Q${answerRef.question_number}` : null);
  const qKey = qRaw && qRaw.startsWith('Q') ? `問${qRaw.slice(1)}` : qRaw;
  const subKey = normalizeSubKey(answerRef.sub);

  for (const source of sources) {
    const data = source.data;
    if (data && data.answers && data.answers[questionId]) {
      return data.answers[questionId];
    }
    if (data && data[questionId]) {
      return data[questionId];
    }
  }

  for (const source of sources) {
    const data = source.data;
    if (!data || typeof data !== 'object') {
      continue;
    }
    if (data.answer_key) {
      const answerKey = data.answer_key;
      const sectionMap = answerKey[section];
      if (!sectionMap) {
        continue;
      }
      const questionMap = sectionMap[qKey] || sectionMap[qRaw];
      if (!questionMap) {
        continue;
      }
      if (subKey && subKey !== '(all)') {
        const subMap = questionMap[subKey] || questionMap[answerRef.sub];
        if (subMap) {
          return mergeAnswerGroups(subMap) || (isAnswerGroupMap(subMap) ? subMap : null);
        }
      }
      return mergeAnswerGroups(questionMap) || (isAnswerGroupMap(questionMap) ? questionMap : null);
    }

    if (section && data[section]) {
      const sectionMap = data[section];
      const questionMap = qRaw && sectionMap[qRaw] ? sectionMap[qRaw] : sectionMap[qKey];
      if (!questionMap) {
        continue;
      }
      if (subKey && subKey !== '(all)') {
        const subMap = questionMap[subKey] || questionMap[answerRef.sub];
        if (subMap) {
          return mergeAnswerGroups(subMap) || (isAnswerGroupMap(subMap) ? subMap : null);
        }
      }
      return mergeAnswerGroups(questionMap) || (isAnswerGroupMap(questionMap) ? questionMap : null);
    }
  }

  return null;
}

function main() {
  if (!fs.existsSync(QUESTION_INDEX)) {
    throw new Error('Missing question index. Run content indexer first.');
  }
  const index = readJson(QUESTION_INDEX);
  const sourcesByExam = buildAnswerSources(path.join(CONTENT_DIR, 'answers'));
  const normalized = {};

  for (const entry of index.questions || []) {
    const questionPath = path.join(process.cwd(), entry.question_path);
    const question = readJson(questionPath);
    const examId = question.exam && question.exam.exam_id ? question.exam.exam_id : null;
    if (!examId) {
      continue;
    }
    const sources = sourcesByExam.get(examId);
    const groups = resolveAnswerGroups(question, sources);
    if (!groups) {
      continue;
    }
    const normalizedGroups = {};
    for (const [groupKey, value] of Object.entries(groups)) {
      normalizedGroups[groupKey] = extractAnswerChars(value);
    }
    normalized[question.question_id] = normalizedGroups;
  }

  const payload = {
    schema_version: 'v1',
    generated_at: new Date().toISOString(),
    answers: normalized
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
  console.log(`Wrote normalized answers to ${OUTPUT_PATH}`);
}

main();

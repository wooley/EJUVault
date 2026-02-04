const fs = require('fs');
const path = require('path');

const DEFAULT_CONTENT_DIR = path.join(process.cwd(), 'content');
const DEFAULT_INDEX_PATH = path.join(DEFAULT_CONTENT_DIR, 'index', 'question_index.json');
const DEFAULT_TAG_INDEX_PATH = path.join(DEFAULT_CONTENT_DIR, 'index', 'tag_index.json');
const DEFAULT_PATTERN_INDEX_PATH = path.join(DEFAULT_CONTENT_DIR, 'index', 'pattern_index.json');
const DEFAULT_NORMALIZED_ANSWERS_PATH = path.join(DEFAULT_CONTENT_DIR, 'answers', 'normalized.json');
const DEFAULT_EXERCISE_HTML_INDEX_PATH = path.join(
  DEFAULT_CONTENT_DIR,
  'index',
  'exercise_html_index.json'
);
const DEFAULT_EXERCISE_HTML_CN_INDEX_PATH = path.join(
  DEFAULT_CONTENT_DIR,
  'index',
  'exercise_html_cn_index.json'
);
const DEFAULT_SOLUTION_HTML_INDEX_PATH = path.join(
  DEFAULT_CONTENT_DIR,
  'index',
  'solution_html_index.json'
);

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

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function normalizeSolutionRef(solutionRef) {
  if (!solutionRef) {
    return null;
  }
  if (typeof solutionRef === 'string') {
    return solutionRef;
  }
  if (typeof solutionRef === 'object' && typeof solutionRef.path === 'string') {
    return solutionRef.path;
  }
  return null;
}

function extractBodyHtml(html) {
  if (!html || typeof html !== 'string') {
    return html;
  }
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? match[1].trim() : html.trim();
}

function normalizeQuestionIdForHtml(questionId) {
  if (!questionId) {
    return null;
  }
  const match = String(questionId).match(/^R(\d+)-(\d+)-(I|II|III|IV)-(\d+)$/);
  if (!match) {
    return null;
  }
  const padded = match[1].padStart(2, '0');
  const normalized = `R${padded}-${match[2]}-${match[3]}-${match[4]}`;
  return normalized === questionId ? null : normalized;
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

function buildAnswerSources(answerDir) {
  const answerFiles = listFiles(answerDir, '.json').filter((file) => !file.includes('ai_ans'));
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
      return { groups: data.answers[questionId], source };
    }
    if (data && data[questionId]) {
      return { groups: data[questionId], source };
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
          const groups = mergeAnswerGroups(subMap) || (isAnswerGroupMap(subMap) ? subMap : null);
          if (groups) {
            return { groups, source };
          }
        }
      }
      const groups = mergeAnswerGroups(questionMap) || (isAnswerGroupMap(questionMap) ? questionMap : null);
      if (groups) {
        return { groups, source };
      }
      continue;
    }

    if (section && data[section]) {
      const sectionMap = data[section];
      if (!sectionMap) {
        continue;
      }
      const questionMap = qRaw && sectionMap[qRaw] ? sectionMap[qRaw] : sectionMap[qKey];
      if (!questionMap) {
        continue;
      }
      if (subKey && subKey !== '(all)') {
        const subMap = questionMap[subKey] || questionMap[answerRef.sub];
        if (subMap) {
          const groups = mergeAnswerGroups(subMap) || (isAnswerGroupMap(subMap) ? subMap : null);
          if (groups) {
            return { groups, source };
          }
        }
      }
      const groups = mergeAnswerGroups(questionMap) || (isAnswerGroupMap(questionMap) ? questionMap : null);
      if (groups) {
        return { groups, source };
      }
    }
  }

  return null;
}

function normalizeTags(tags) {
  if (!tags) {
    return [];
  }
  if (Array.isArray(tags)) {
    return tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim());
  }
  if (typeof tags === 'object') {
    const normalized = [];
    for (const [category, values] of Object.entries(tags)) {
      if (!Array.isArray(values)) {
        continue;
      }
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          normalized.push(`${category}:${value.trim()}`);
        }
      }
    }
    return normalized;
  }
  return [];
}

function createContentLoader() {
  if (!fs.existsSync(DEFAULT_INDEX_PATH)) {
    throw new Error(`Missing question index at ${DEFAULT_INDEX_PATH}. Run the content indexer first.`);
  }
  const index = readJson(DEFAULT_INDEX_PATH);
  const questionMap = new Map();
  const questionIndexMap = new Map();
  for (const entry of index.questions || []) {
    if (entry.question_id && entry.question_path) {
      questionMap.set(entry.question_id, entry.question_path);
      questionIndexMap.set(entry.question_id, entry);
    }
  }
  const answerSources = buildAnswerSources(path.join(DEFAULT_CONTENT_DIR, 'answers'));
  const normalizedCache = {
    mtimeMs: null,
    data: null
  };
  const questionCache = new Map();
  const tagIndex = fs.existsSync(DEFAULT_TAG_INDEX_PATH) ? readJson(DEFAULT_TAG_INDEX_PATH) : null;
  const patternIndex = fs.existsSync(DEFAULT_PATTERN_INDEX_PATH) ? readJson(DEFAULT_PATTERN_INDEX_PATH) : null;
  const exerciseHtmlIndex = fs.existsSync(DEFAULT_EXERCISE_HTML_INDEX_PATH)
    ? readJson(DEFAULT_EXERCISE_HTML_INDEX_PATH)
    : null;
  const exerciseHtmlCnIndex = fs.existsSync(DEFAULT_EXERCISE_HTML_CN_INDEX_PATH)
    ? readJson(DEFAULT_EXERCISE_HTML_CN_INDEX_PATH)
    : null;
  const solutionHtmlIndex = fs.existsSync(DEFAULT_SOLUTION_HTML_INDEX_PATH)
    ? readJson(DEFAULT_SOLUTION_HTML_INDEX_PATH)
    : null;
  const exerciseHtmlMap = new Map();
  const exerciseHtmlCache = new Map();
  const exerciseHtmlCnMap = new Map();
  const exerciseHtmlCnCache = new Map();
  const solutionHtmlMap = new Map();
  const solutionHtmlCache = new Map();

  if (exerciseHtmlIndex && Array.isArray(exerciseHtmlIndex.questions)) {
    for (const entry of exerciseHtmlIndex.questions) {
      if (entry && entry.question_id && entry.html_path) {
        exerciseHtmlMap.set(entry.question_id, entry.html_path);
      }
    }
  }
  if (exerciseHtmlCnIndex && Array.isArray(exerciseHtmlCnIndex.questions)) {
    for (const entry of exerciseHtmlCnIndex.questions) {
      if (entry && entry.question_id && entry.html_path) {
        exerciseHtmlCnMap.set(entry.question_id, entry.html_path);
      }
    }
  }
  if (solutionHtmlIndex && Array.isArray(solutionHtmlIndex.solutions)) {
    for (const entry of solutionHtmlIndex.solutions) {
      if (entry && entry.solution_ref && entry.html_path) {
        solutionHtmlMap.set(entry.solution_ref, entry.html_path);
      }
    }
  }

  function getQuestion(questionId) {
    if (!questionMap.has(questionId)) {
      return null;
    }
    if (questionCache.has(questionId)) {
      return questionCache.get(questionId);
    }
    const questionPath = path.join(process.cwd(), questionMap.get(questionId));
    const question = readJson(questionPath);
    questionCache.set(questionId, question);
    return question;
  }

  function clearQuestionCache(questionId) {
    if (!questionId) {
      return;
    }
    questionCache.delete(questionId);
  }

  function getAnswerGroups(question) {
    if (fs.existsSync(DEFAULT_NORMALIZED_ANSWERS_PATH)) {
      const stat = fs.statSync(DEFAULT_NORMALIZED_ANSWERS_PATH);
      if (!normalizedCache.data || normalizedCache.mtimeMs !== stat.mtimeMs) {
        normalizedCache.data = readJson(DEFAULT_NORMALIZED_ANSWERS_PATH);
        normalizedCache.mtimeMs = stat.mtimeMs;
      }
      if (normalizedCache.data && normalizedCache.data.answers && normalizedCache.data.answers[question.question_id]) {
        return normalizedCache.data.answers[question.question_id];
      }
    }
    const examId = question.exam && question.exam.exam_id ? question.exam.exam_id : null;
    if (!examId) {
      return null;
    }
    const sources = answerSources.get(examId);
    const resolved = resolveAnswerGroups(question, sources);
    return resolved ? resolved.groups : null;
  }

  function getQuestionMetadata(question) {
    return {
      difficulty: question.difficulty ? question.difficulty.level : null,
      tags: normalizeTags(question.tags),
      pattern_id: question.pattern_id || null
    };
  }

  function resolveSolutionPath(solutionRef) {
    const normalizedRef = normalizeSolutionRef(solutionRef);
    if (!normalizedRef) {
      return null;
    }
    const directPath = path.join(process.cwd(), normalizedRef);
    if (fs.existsSync(directPath)) {
      return directPath;
    }
    const fallbackRelative = normalizedRef.startsWith('data/solutions/')
      ? normalizedRef.replace('data/solutions/', 'solutions/')
      : normalizedRef;
    const fallbackPath = path.join(DEFAULT_CONTENT_DIR, fallbackRelative);
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }
    return null;
  }

  function getSolutionText(question) {
    const resolved = resolveSolutionPath(question.solution_ref);
    if (!resolved) {
      return null;
    }
    try {
      return readText(resolved);
    } catch (error) {
      return null;
    }
  }

  function getSolutionHtml(question) {
    if (!question || !question.solution_ref) {
      return null;
    }
    const normalizedRef = normalizeSolutionRef(question.solution_ref);
    if (!normalizedRef) {
      return null;
    }
    const htmlPath = solutionHtmlMap.get(normalizedRef);
    if (!htmlPath) {
      return null;
    }
    if (solutionHtmlCache.has(normalizedRef)) {
      return solutionHtmlCache.get(normalizedRef);
    }
    const resolvedPath = path.join(process.cwd(), htmlPath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
    }
    try {
      const html = readText(resolvedPath);
      const body = extractBodyHtml(html);
      solutionHtmlCache.set(normalizedRef, body);
      return body;
    } catch (error) {
      return null;
    }
  }

  function getExerciseHtml(questionId) {
    const normalizedId = normalizeQuestionIdForHtml(questionId);
    const htmlPath = exerciseHtmlMap.get(questionId) || (normalizedId && exerciseHtmlMap.get(normalizedId));
    if (!htmlPath) {
      return null;
    }
    if (exerciseHtmlCache.has(questionId)) {
      return exerciseHtmlCache.get(questionId);
    }
    const resolvedPath = path.join(process.cwd(), htmlPath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
    }
    try {
      const html = readText(resolvedPath);
      const body = extractBodyHtml(html);
      exerciseHtmlCache.set(questionId, body);
      if (normalizedId) {
        exerciseHtmlCache.set(normalizedId, body);
      }
      return body;
    } catch (error) {
      return null;
    }
  }

  function getExerciseHtmlZh(questionId) {
    const normalizedId = normalizeQuestionIdForHtml(questionId);
    const htmlPath = exerciseHtmlCnMap.get(questionId) || (normalizedId && exerciseHtmlCnMap.get(normalizedId));
    if (!htmlPath) {
      return null;
    }
    if (exerciseHtmlCnCache.has(questionId)) {
      return exerciseHtmlCnCache.get(questionId);
    }
    const resolvedPath = path.join(process.cwd(), htmlPath);
    if (!fs.existsSync(resolvedPath)) {
      return null;
    }
    try {
      const html = readText(resolvedPath);
      const body = extractBodyHtml(html);
      exerciseHtmlCnCache.set(questionId, body);
      if (normalizedId) {
        exerciseHtmlCnCache.set(normalizedId, body);
      }
      return body;
    } catch (error) {
      return null;
    }
  }

  function getQuestionIndex(questionId) {
    return questionIndexMap.get(questionId) || null;
  }

  function getAllQuestionIds() {
    return Array.from(questionIndexMap.keys());
  }

  function getTagIndex() {
    return tagIndex;
  }

  function getPatternIndex() {
    return patternIndex;
  }

  return {
    getQuestion,
    clearQuestionCache,
    getAnswerGroups,
    getQuestionMetadata,
    getQuestionIndex,
    getAllQuestionIds,
    getTagIndex,
    getPatternIndex,
    getSolutionText,
    getSolutionHtml,
    getExerciseHtml,
    getExerciseHtmlZh
  };
}

module.exports = { createContentLoader };

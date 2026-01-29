const fs = require('fs');
const path = require('path');

const DEFAULT_CONTENT_DIR = path.join(process.cwd(), 'content');
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_CONTENT_DIR, 'index');

const ALLOWED_PATTERN_DOMAINS = new Set([
  'ALG', 'QF', 'SEQ', 'GEO', 'VEC', 'PROB', 'CALC', 'INT', 'DATA'
]);
const ALLOWED_PATTERN_MECHANISMS = new Set([
  'DIRECT', 'DISCRIMINANT', 'INTERVAL', 'TRANSFORM', 'COUNT', 'ELIMINATION',
  'CONSTRAINT', 'CASE', 'PROJECTION', 'AREA', 'RATE'
]);
const ALLOWED_PATTERN_GOALS = new Set([
  'SOLVE_X', 'SOLVE_PARAM', 'FIND_RANGE', 'COUNT_INT', 'MINMAX',
  'INTERSECTION', 'LENGTH', 'ANGLE', 'PROBABILITY'
]);

const ANSWER_CHARSET = new Set(['-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
const UNSPECIFIED_PATTERN = '__UNSPECIFIED__';

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    contentDir: DEFAULT_CONTENT_DIR,
    outputDir: DEFAULT_OUTPUT_DIR
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--content' && args[i + 1]) {
      result.contentDir = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--out' && args[i + 1]) {
      result.outputDir = path.resolve(args[i + 1]);
      i += 1;
    }
  }
  return result;
}

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

function readJson(filePath, errors) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    errors.push({
      code: 'JSON_PARSE_FAILED',
      message: `Failed to parse JSON: ${error.message}`,
      file: toWorkspacePath(filePath)
    });
    return null;
  }
}

function toWorkspacePath(filePath) {
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    return path.relative(cwd, filePath);
  }
  return filePath;
}

function extractBlankIds(question) {
  if (Array.isArray(question.blanks)) {
    return question.blanks
      .map((blank) => (typeof blank === 'string' ? blank : blank.id))
      .filter(Boolean);
  }
  if (question.original_ja && question.original_ja.placeholders) {
    return Object.keys(question.original_ja.placeholders);
  }
  if (question.structure && Array.isArray(question.structure.blanks)) {
    return question.structure.blanks.slice();
  }
  if (Array.isArray(question.subquestions)) {
    const ids = [];
    for (const sub of question.subquestions) {
      if (Array.isArray(sub.blanks)) {
        for (const blank of sub.blanks) {
          if (blank && blank.id) {
            ids.push(blank.id);
          }
        }
      }
    }
    return ids;
  }
  return [];
}

function extractBlankIdsForSub(question, subKey) {
  if (!subKey || subKey === '(all)') {
    return extractBlankIds(question);
  }
  if (Array.isArray(question.subquestions)) {
    const match = question.subquestions.find((sub) => normalizeSubKey(sub.sub_id) === subKey);
    if (match && Array.isArray(match.blanks)) {
      return match.blanks.map((blank) => blank.id).filter(Boolean);
    }
  }
  return extractBlankIds(question);
}

function expandBlankChars(blankIds) {
  const chars = new Set();
  for (const id of blankIds) {
    if (typeof id !== 'string') {
      continue;
    }
    for (const ch of id) {
      chars.add(ch);
    }
  }
  return chars;
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

function validatePatternId(patternId) {
  if (!patternId || typeof patternId !== 'string') {
    return { valid: false, reason: 'missing' };
  }
  const parts = patternId.split('_');
  if (parts.length < 3) {
    return { valid: false, reason: 'format' };
  }
  const [domain, mechanism, ...goalParts] = parts;
  const goal = goalParts.join('_');
  if (!ALLOWED_PATTERN_DOMAINS.has(domain)) {
    return { valid: false, reason: 'domain' };
  }
  if (!ALLOWED_PATTERN_MECHANISMS.has(mechanism)) {
    return { valid: false, reason: 'mechanism' };
  }
  if (!ALLOWED_PATTERN_GOALS.has(goal)) {
    return { valid: false, reason: 'goal' };
  }
  return { valid: true };
}

function buildAnswerSources(answerDir, errors) {
  const answerFiles = listFiles(answerDir, '.json').filter((file) => !file.includes('ai_ans'));
  const sourcesByExam = new Map();
  for (const file of answerFiles) {
    const data = readJson(file, errors);
    if (!data) {
      continue;
    }
    const examId = path.basename(path.dirname(file));
    if (!sourcesByExam.has(examId)) {
      sourcesByExam.set(examId, []);
    }
    sourcesByExam.get(examId).push({ data, file });
  }
  return sourcesByExam;
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

function checkAnswerCharset(value, errors, context) {
  const chars = extractAnswerChars(value);
  if (!chars) {
    return;
  }
  for (const ch of chars) {
    if (!ANSWER_CHARSET.has(ch)) {
      errors.push({
        code: 'ANSWER_CHARSET_INVALID',
        message: `Answer contains invalid character '${ch}'`,
        ...context
      });
      return;
    }
  }
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

function checkSolutionRef(solutionRef, contentDir, warnings, context) {
  const refPath = normalizeSolutionRef(solutionRef);
  if (!refPath) {
    warnings.push({
      code: solutionRef ? 'SOLUTION_REF_INVALID' : 'SOLUTION_REF_MISSING',
      message: solutionRef ? 'solution_ref must be a string or { path }' : 'solution_ref is missing',
      ...context
    });
    return;
  }
  const directPath = path.join(process.cwd(), refPath);
  if (fs.existsSync(directPath)) {
    return;
  }
  const fallbackPath = path.join(contentDir, refPath.replace(/^data\/solutions\//, 'solutions/'));
  if (fs.existsSync(fallbackPath)) {
    return;
  }
  warnings.push({
    code: 'SOLUTION_REF_NOT_FOUND',
    message: `solution_ref file not found: ${refPath}`,
    ...context
  });
}

function main() {
  const { contentDir, outputDir } = parseArgs();
  const questionDir = path.join(contentDir, 'questions');
  const answerDir = path.join(contentDir, 'answers');

  const errors = [];
  const warnings = [];
  const questions = [];
  const questionIdMap = new Map();

  const questionFiles = listFiles(questionDir, '.json');
  const answerSources = buildAnswerSources(answerDir, errors);

  for (const file of questionFiles) {
    const question = readJson(file, errors);
    if (!question) {
      continue;
    }
    const questionId = question.question_id;
    if (!questionId) {
      errors.push({
        code: 'QUESTION_ID_MISSING',
        message: 'question_id is missing',
        file: toWorkspacePath(file)
      });
      continue;
    }
    if (questionIdMap.has(questionId)) {
      errors.push({
        code: 'QUESTION_ID_DUPLICATE',
        message: `Duplicate question_id: ${questionId}`,
        file: toWorkspacePath(file),
        other_file: toWorkspacePath(questionIdMap.get(questionId))
      });
      continue;
    }
    questionIdMap.set(questionId, file);

    const tags = normalizeTags(question.tags);
    if (tags.length === 0) {
      errors.push({
        code: 'TAGS_MISSING',
        message: 'tags are missing or empty',
        question_id: questionId,
        file: toWorkspacePath(file)
      });
    }

    const patternId = question.pattern_id || null;
    const patternCheck = validatePatternId(patternId);
    if (!patternCheck.valid) {
      errors.push({
        code: 'PATTERN_ID_INVALID',
        message: `pattern_id is missing or invalid (${patternCheck.reason})`,
        question_id: questionId,
        file: toWorkspacePath(file)
      });
    }

    const answerRef = question.answer_ref || {};
    const subKey = normalizeSubKey(answerRef.sub);
    const blankIds = extractBlankIdsForSub(question, subKey);
    const blankChars = expandBlankChars(blankIds);

    const examId = question.exam && question.exam.exam_id ? question.exam.exam_id : null;
    const sources = examId ? answerSources.get(examId) : null;
    const answerLookup = resolveAnswerGroups(question, sources);
    if (!answerLookup || !answerLookup.groups) {
      errors.push({
        code: 'ANSWER_NOT_FOUND',
        message: 'Answer group not found for question',
        question_id: questionId,
        file: toWorkspacePath(file)
      });
    } else {
      const answerGroups = answerLookup.groups;
      const answerChars = new Set();
      for (const [groupKey, value] of Object.entries(answerGroups)) {
        if (typeof groupKey === 'string') {
          for (const ch of groupKey) {
            answerChars.add(ch);
          }
        }
        checkAnswerCharset(value, errors, {
          question_id: questionId,
          file: toWorkspacePath(answerLookup.source.file),
          group: groupKey
        });
      }
      if (blankChars.size > 0) {
        const missing = [...blankChars].filter((ch) => !answerChars.has(ch));
        const extra = [...answerChars].filter((ch) => !blankChars.has(ch));
        if (missing.length > 0 || extra.length > 0) {
          errors.push({
            code: 'BLANK_ANSWER_MISMATCH',
            message: `Blank/answer key mismatch. Missing: ${missing.join('')} Extra: ${extra.join('')}`,
            question_id: questionId,
            file: toWorkspacePath(file)
          });
        }
      }
    }

    checkSolutionRef(question.solution_ref, contentDir, warnings, {
      question_id: questionId,
      file: toWorkspacePath(file)
    });

    const difficultyLevel = question.difficulty ? question.difficulty.level : null;
    questions.push({
      question_id: questionId,
      exam_id: examId,
      course: question.course || null,
      section: question.section || null,
      order: question.order ?? question.question_number ?? null,
      type: question.type || question.structure?.type || null,
      pattern_id: patternId,
      tags,
      difficulty_level: difficultyLevel ?? null,
      answer_ref: question.answer_ref || null,
      solution_ref: question.solution_ref || null,
      question_path: toWorkspacePath(file)
    });
  }

  const tagIndex = {};
  const patternIndex = {};

  for (const entry of questions) {
    const tags = entry.tags || [];
    const patternId = entry.pattern_id || UNSPECIFIED_PATTERN;

    if (patternId !== UNSPECIFIED_PATTERN) {
      if (!patternIndex[patternId]) {
        patternIndex[patternId] = {
          question_count: 0,
          difficulty_distribution: {},
          question_ids: []
        };
      }
      const patternEntry = patternIndex[patternId];
      patternEntry.question_count += 1;
      const difficultyKey = entry.difficulty_level ? String(entry.difficulty_level) : 'unknown';
      patternEntry.difficulty_distribution[difficultyKey] =
        (patternEntry.difficulty_distribution[difficultyKey] || 0) + 1;
      patternEntry.question_ids.push(entry.question_id);
    }

    for (const tag of tags) {
      if (!tagIndex[tag]) {
        tagIndex[tag] = {};
      }
      if (!tagIndex[tag][patternId]) {
        tagIndex[tag][patternId] = [];
      }
      tagIndex[tag][patternId].push(entry.question_id);
    }
  }

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const generatedAt = new Date().toISOString();

  const questionIndex = {
    schema_version: 'v1',
    generated_at: generatedAt,
    questions
  };

  const tagIndexPayload = {
    schema_version: 'v1',
    generated_at: generatedAt,
    tags: tagIndex
  };

  const patternIndexPayload = {
    schema_version: 'v1',
    generated_at: generatedAt,
    patterns: patternIndex
  };

  const integrityReport = {
    schema_version: 'v1',
    generated_at: generatedAt,
    errors,
    warnings,
    stats: {
      question_count: questions.length,
      error_count: errors.length,
      warning_count: warnings.length
    }
  };

  fs.writeFileSync(path.join(outputDir, 'question_index.json'), JSON.stringify(questionIndex, null, 2));
  fs.writeFileSync(path.join(outputDir, 'tag_index.json'), JSON.stringify(tagIndexPayload, null, 2));
  fs.writeFileSync(path.join(outputDir, 'pattern_index.json'), JSON.stringify(patternIndexPayload, null, 2));
  fs.writeFileSync(path.join(outputDir, 'integrity_report.json'), JSON.stringify(integrityReport, null, 2));
}

main();

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(process.cwd(), 'content');
const QUESTIONS_DIR = path.join(CONTENT_DIR, 'questions');

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

function isObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function inferEra(year) {
  if (!Number.isFinite(year)) {
    return null;
  }
  return year >= 2019 ? '令和' : '平成';
}

function inferExamId(question) {
  if (typeof question.question_id !== 'string') {
    return null;
  }
  const parts = question.question_id.split('-');
  if (!parts.length) {
    return null;
  }
  if (question.section) {
    const sectionIndex = parts.indexOf(question.section);
    if (sectionIndex > 0) {
      return parts.slice(0, sectionIndex).join('-');
    }
  }
  if (parts.length >= 2) {
    return parts.slice(0, 2).join('-');
  }
  return question.question_id;
}

function ensureExam(question) {
  let exam = isObject(question.exam) ? { ...question.exam } : null;
  if (typeof question.exam === 'string') {
    question.exam_label = question.exam;
  }
  const examId = (exam && exam.exam_id) || question.exam_id || inferExamId(question);
  const year = (exam && exam.year) ?? question.year ?? null;
  const era = (exam && exam.era) || question.era || inferEra(year);
  const session = (exam && exam.session) ?? question.session ?? null;
  const subject = (exam && exam.subject) || question.subject || null;

  if (!exam) {
    exam = {};
  }
  if (examId) {
    exam.exam_id = examId;
  }
  if (Number.isFinite(year)) {
    exam.year = year;
  }
  if (era) {
    exam.era = era;
  }
  if (Number.isFinite(session)) {
    exam.session = session;
  }
  if (subject) {
    exam.subject = subject;
  }

  question.exam = exam;
  delete question.exam_id;
  delete question.year;
  delete question.era;
  delete question.session;
  delete question.subject;
}

function ensureType(question) {
  if (typeof question.type === 'string' && question.type) {
    return;
  }
  let resolved = null;
  if (typeof question.format === 'string') {
    resolved = question.format;
  }
  if (!resolved && typeof question.answer_format === 'string') {
    resolved = question.answer_format === 'fill_in_blank' ? 'fill_in' : question.answer_format;
  }
  if (!resolved && (question.blanks || (question.original_ja && question.original_ja.placeholders))) {
    resolved = 'fill_in';
  }
  if (resolved) {
    question.type = resolved;
  }
  delete question.format;
  delete question.answer_format;
}

function extractPlaceholderOrder(question) {
  const textJa = question.original_ja && question.original_ja.text ? question.original_ja.text : '';
  const textZh = question.translation_zh && question.translation_zh.text ? question.translation_zh.text : '';
  const source = textJa || textZh || '';
  const regex = /[\[［]([A-Z]+)[\]］]/g;
  const seen = new Set();
  const order = [];
  let match;
  while ((match = regex.exec(source))) {
    const groupId = match[1];
    if (!groupId || seen.has(groupId)) {
      continue;
    }
    seen.add(groupId);
    order.push(groupId);
  }
  return order;
}

function normalizeBlanks(question) {
  const placeholderMeta = question.original_ja && question.original_ja.placeholders
    ? question.original_ja.placeholders
    : null;

  if (Array.isArray(question.blanks)) {
    question.blanks = question.blanks
      .map((blank) => {
        if (typeof blank === 'string') {
          return { id: blank, length: blank.length };
        }
        if (!isObject(blank)) {
          return null;
        }
        const next = { ...blank };
        if (!next.id && next.key) {
          next.id = next.key;
          delete next.key;
        }
        if (!next.id) {
          return null;
        }
        if (!Number.isFinite(next.length)) {
          if (placeholderMeta && placeholderMeta[next.id] && Number.isFinite(placeholderMeta[next.id].digits)) {
            next.length = placeholderMeta[next.id].digits;
          } else {
            next.length = String(next.id).length;
          }
        }
        return next;
      })
      .filter(Boolean);
  } else if (placeholderMeta && isObject(placeholderMeta)) {
    const order = extractPlaceholderOrder(question);
    const keys = order.length > 0 ? order : Object.keys(placeholderMeta);
    question.blanks = keys.map((groupId) => {
      const meta = placeholderMeta[groupId] || {};
      const length = Number.isFinite(meta.digits) ? meta.digits : String(groupId).length;
      return { id: groupId, length };
    });
  }

  if (question.original_ja && question.original_ja.placeholders) {
    delete question.original_ja.placeholders;
  }
}

function ensureTextFields(question) {
  if (!question.original_ja || !isObject(question.original_ja)) {
    if (question.prompt_ja) {
      question.original_ja = { text: question.prompt_ja };
    }
  } else if (!question.original_ja.text && question.prompt_ja) {
    question.original_ja.text = question.prompt_ja;
  }

  if (!question.translation_zh || !isObject(question.translation_zh)) {
    if (question.problem_statement) {
      question.translation_zh = { text: question.problem_statement };
    }
  } else if (!question.translation_zh.text && question.problem_statement) {
    question.translation_zh.text = question.problem_statement;
  }
}

function normalizeQuestion(question) {
  if (!isObject(question)) {
    return question;
  }
  ensureExam(question);
  ensureType(question);
  ensureTextFields(question);
  normalizeBlanks(question);
  return question;
}

function main() {
  const files = listFiles(QUESTIONS_DIR, '.json');
  let updated = 0;
  files.forEach((filePath) => {
    const data = readJson(filePath);
    const before = JSON.stringify(data);
    const normalized = normalizeQuestion(data);
    const after = JSON.stringify(normalized);
    if (before !== after) {
      writeJson(filePath, normalized);
      updated += 1;
    }
  });
  console.log(`Normalized ${updated}/${files.length} question files.`);
}

main();

const fs = require('fs');
const path = require('path');

const CONTENT_DIR = path.join(process.cwd(), 'content');
const QUESTIONS_DIR = path.join(CONTENT_DIR, 'questions');
const OUTPUT_DIR = path.join(CONTENT_DIR, 'exercise');

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

function formatBlanks(question) {
  if (Array.isArray(question.blanks) && question.blanks.length > 0) {
    return question.blanks
      .map((blank) => {
        if (typeof blank === 'string') {
          return `- ${blank} (length: ${blank.length})`;
        }
        if (!blank || !blank.id) {
          return null;
        }
        const length = Number.isFinite(blank.length) ? blank.length : null;
        return `- ${blank.id}${length ? ` (length: ${length})` : ''}`;
      })
      .filter(Boolean)
      .join('\n');
  }
  const placeholders = question.original_ja && question.original_ja.placeholders;
  if (!placeholders || typeof placeholders !== 'object') {
    return '';
  }
  return Object.entries(placeholders)
    .map(([key, value]) => {
      const digits = value && typeof value === 'object' && value.digits ? value.digits : null;
      return `- ${key}${digits ? ` (digits: ${digits})` : ''}`;
    })
    .join('\n');
}

function writeMarkdown(question, outputPath) {
  const lines = [];
  const questionId = question.question_id || 'unknown';
  const examId = question.exam && question.exam.exam_id ? question.exam.exam_id : 'unknown';
  const section = question.section || 'unknown';
  const order = question.order ?? question.question_number ?? 'unknown';

  lines.push(`# ${questionId}`);
  lines.push('');
  lines.push(`- exam_id: ${examId}`);
  lines.push(`- section: ${section}`);
  lines.push(`- order: ${order}`);
  lines.push('');

  const textJa = question.original_ja && question.original_ja.text
    ? question.original_ja.text
    : (question.original_text_ja || '');
  lines.push('## Original (JA)');
  lines.push('');
  lines.push(textJa || '');
  lines.push('');

  const textZh = question.translation_zh && question.translation_zh.text
    ? question.translation_zh.text
    : '';
  lines.push('## Translation (ZH)');
  lines.push('');
  lines.push(textZh || '');
  lines.push('');

  const blanksText = formatBlanks(question);
  if (blanksText) {
    lines.push('## Blanks');
    lines.push('');
    lines.push(blanksText);
    lines.push('');
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${lines.join('\n')}\n`);
}

function main() {
  const files = listFiles(QUESTIONS_DIR, '.json');
  for (const file of files) {
    const question = readJson(file);
    const relative = path.relative(QUESTIONS_DIR, file);
    const outputPath = path.join(OUTPUT_DIR, relative.replace(/\.json$/, '.md'));
    writeMarkdown(question, outputPath);
  }
  console.log(`Exported ${files.length} questions to ${OUTPUT_DIR}`);
}

main();

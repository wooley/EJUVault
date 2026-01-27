const fs = require('fs');
const path = require('path');
const mume = require('@shd101wyy/mume');

const DEFAULT_CONTENT_DIR = path.join(process.cwd(), 'content');
const DEFAULT_OUTPUT_DIR = path.join(DEFAULT_CONTENT_DIR, 'index', 'exercise_html');
let katexConfigured = false;

async function ensureKatexConfig(configPath) {
  if (katexConfigured) {
    return;
  }
  let katexConfig = {};
  try {
    katexConfig = await mume.utility.getKaTeXConfig(configPath);
  } catch (error) {
    katexConfig = {};
  }
  mume.configs.katexConfig = {
    ...(katexConfig || {}),
    strict: 'ignore'
  };
  katexConfigured = true;
}

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

function toWorkspacePath(filePath) {
  const cwd = process.cwd();
  if (filePath.startsWith(cwd)) {
    return path.relative(cwd, filePath);
  }
  return filePath;
}

async function renderMarkdownFile(filePath) {
  const configPath = mume.utility.getConfigPath();
  await ensureKatexConfig(configPath);
  let userConfig = {};
  try {
    userConfig = await mume.utility.getExtensionConfig(configPath);
  } catch (error) {
    userConfig = {};
  }
  const inlineDelimiters = Array.isArray(userConfig.mathInlineDelimiters)
    ? userConfig.mathInlineDelimiters.map((pair) => pair.slice())
    : [];
  const blockDelimiters = Array.isArray(userConfig.mathBlockDelimiters)
    ? userConfig.mathBlockDelimiters.map((pair) => pair.slice())
    : [];
  const ensureDelimiter = (list, left, right) => {
    if (!list.some((pair) => pair && pair[0] === left && pair[1] === right)) {
      list.push([left, right]);
    }
  };
  ensureDelimiter(inlineDelimiters, '$', '$');
  ensureDelimiter(inlineDelimiters, '\\(', '\\)');
  ensureDelimiter(blockDelimiters, '$$', '$$');
  ensureDelimiter(blockDelimiters, '\\[', '\\]');
  const config = {
    configPath,
    ...userConfig,
    mathRenderingOption: 'KaTeX',
    mathInlineDelimiters: inlineDelimiters,
    mathBlockDelimiters: blockDelimiters
  };
  const engine = new mume.MarkdownEngine({
    filePath,
    projectDirectoryPath: process.cwd(),
    config
  });
  const output = await engine.parseMD(undefined, {
    useRelativeFilePath: true,
    isForPreview: false,
    hideFrontMatter: true
  });
  const html = await engine.generateHTMLTemplateForExport(output.html, output.yamlConfig, {
    isForPrint: false,
    isForPrince: false,
    offline: false,
    embedLocalImages: false,
    embedSVG: true
  });
  return normalizeExportHtml(html);
}

function normalizeExportHtml(html) {
  if (!html || typeof html !== 'string') {
    return html;
  }
  let normalized = html;
  normalized = normalized.replace(
    /<div class="mume markdown-preview/g,
    '<div class="crossnote markdown-preview'
  );
  normalized = normalized.replace(
    /<(h[1-6]) class="mume-header" id="([^"]+)">/g,
    '<$1 id="$2">'
  );
  return normalized;
}

async function main() {
  const { contentDir, outputDir } = parseArgs();
  const exerciseDir = path.join(contentDir, 'exercise');
  const indexPath = path.join(contentDir, 'index', 'exercise_html_index.json');

  const files = listFiles(exerciseDir, '.md');
  const questions = [];

  for (const file of files) {
    const relative = path.relative(exerciseDir, file);
    const outputPath = path.join(outputDir, relative.replace(/\.md$/i, '.html'));
    const html = await renderMarkdownFile(file);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html);
    questions.push({
      question_id: path.basename(file, '.md'),
      md_path: toWorkspacePath(file),
      html_path: toWorkspacePath(outputPath)
    });
  }

  const payload = {
    schema_version: 'v1',
    generated_at: new Date().toISOString(),
    questions
  };
  fs.mkdirSync(path.dirname(indexPath), { recursive: true });
  fs.writeFileSync(indexPath, JSON.stringify(payload, null, 2));

  console.log(`Generated ${questions.length} exercise HTML files in ${outputDir}`);
  console.log(`Index saved to ${indexPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

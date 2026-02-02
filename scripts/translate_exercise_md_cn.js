const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DEFAULT_SRC_DIR = path.join(process.cwd(), 'content', 'exercise');
const DEFAULT_OUT_DIR = path.join(process.cwd(), 'content', 'exercise_cn');
const DEFAULT_CACHE_DIR = path.join(process.cwd(), 'data', '.cache');
const DEFAULT_CACHE_PATH = path.join(DEFAULT_CACHE_DIR, 'exercise_md_zh_cache.json');
const DEFAULT_MANIFEST_PATH = path.join(DEFAULT_CACHE_DIR, 'exercise_md_zh_manifest.json');
const DEFAULT_OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const OLLAMA_RETRY_MAX = Number(process.env.OLLAMA_RETRY_MAX || 4);
const OLLAMA_RETRY_DELAY_MS = Number(process.env.OLLAMA_RETRY_DELAY_MS || 1500);

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {
    srcDir: DEFAULT_SRC_DIR,
    outDir: DEFAULT_OUT_DIR,
    cachePath: DEFAULT_CACHE_PATH,
    manifestPath: DEFAULT_MANIFEST_PATH,
    provider: process.env.TRANSLATE_PROVIDER || '',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    apiKey: process.env.OPENAI_API_KEY || '',
    ollamaHost: DEFAULT_OLLAMA_HOST,
    maxSegmentChars: Number(process.env.MD_TRANSLATE_MAX_CHARS || 4500),
    force: false,
    dryRun: false,
    limit: 0
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--src' && args[i + 1]) {
      result.srcDir = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--out' && args[i + 1]) {
      result.outDir = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--cache' && args[i + 1]) {
      result.cachePath = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--manifest' && args[i + 1]) {
      result.manifestPath = path.resolve(args[i + 1]);
      i += 1;
    } else if (arg === '--base-url' && args[i + 1]) {
      result.baseUrl = args[i + 1];
      i += 1;
    } else if (arg === '--model' && args[i + 1]) {
      result.model = args[i + 1];
      i += 1;
    } else if (arg === '--api-key' && args[i + 1]) {
      result.apiKey = args[i + 1];
      i += 1;
    } else if (arg === '--provider' && args[i + 1]) {
      result.provider = args[i + 1];
      i += 1;
    } else if (arg === '--provider') {
      result.provider = '__MISSING__';
    } else if (arg === '--ollama-host' && args[i + 1]) {
      result.ollamaHost = args[i + 1];
      i += 1;
    } else if (arg === '--max-chars' && args[i + 1]) {
      result.maxSegmentChars = Number(args[i + 1]);
      i += 1;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--dry-run') {
      result.dryRun = true;
    } else if (arg === '--limit' && args[i + 1]) {
      result.limit = Number(args[i + 1]);
      i += 1;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    }
  }
  return result;
}

function printHelp() {
  // eslint-disable-next-line no-console
  console.log(`Translate Markdown exercises to Simplified Chinese.

Usage:
  node scripts/translate_exercise_md_cn.js --provider ollama --model gtp-oss:120b-cloud

Options:
  --src <dir>         Source dir (default: content/exercise)
  --out <dir>         Output dir (default: content/exercise_cn)
  --cache <file>      Chunk cache path (default: data/.cache/exercise_md_zh_cache.json)
  --manifest <file>   File manifest path (default: data/.cache/exercise_md_zh_manifest.json)
  --provider <name>   Provider: ollama|openai (default: auto)
  --model <name>      Model name (default: env OPENAI_MODEL or gpt-4.1-mini)
  --ollama-host <url> Ollama host (default: http://localhost:11434)
  --base-url <url>    OpenAI-compatible base URL (default: https://api.openai.com/v1)
  --api-key <key>     OpenAI API key (default: env OPENAI_API_KEY)
  --max-chars <n>     Max chars per segment (default: 4500)
  --force             Re-translate even if unchanged
  --dry-run           No network; writes output identical to source (for pipeline checks)
  --limit <n>         Only process first N files

Env:
  TRANSLATE_PROVIDER, OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL, OLLAMA_HOST, MD_TRANSLATE_MAX_CHARS
`);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

function ensureDirForFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function listMarkdownFiles(dir) {
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
      files.push(...listMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, obj) {
  ensureDirForFile(filePath);
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function splitFrontmatter(markdown) {
  if (!markdown.startsWith('---\n')) {
    return { frontmatter: '', body: markdown };
  }
  const end = markdown.indexOf('\n---\n', 4);
  if (end === -1) {
    return { frontmatter: '', body: markdown };
  }
  const frontmatter = markdown.slice(0, end + '\n---\n'.length);
  const body = markdown.slice(end + '\n---\n'.length);
  return { frontmatter, body };
}

function protectSegments(text) {
  const placeholders = [];
  const add = (match) => {
    const key = `<<P${placeholders.length}>>`;
    placeholders.push(match);
    return key;
  };

  let protectedText = text;

  // Roman numerals in headings like "# I" or "## IV　問2" should stay as-is.
  protectedText = protectedText.replace(
    /^(#{1,6}\s+)([IVXLC]+)([ \t　]*)(?=(?:問\d+)?[ \t　]*$)/gm,
    (m, p1, roman, p3) => `${p1}${add(roman)}${p3}`
  );

  // Fenced code blocks ```...``` or ~~~...~~~
  protectedText = protectedText.replace(/```[\s\S]*?```/g, add);
  protectedText = protectedText.replace(/~~~[\s\S]*?~~~/g, add);

  // LaTeX block math: $$...$$ and \[...\]
  protectedText = protectedText.replace(/\$\$[\s\S]*?\$\$/g, add);
  protectedText = protectedText.replace(/\\\[[\s\S]*?\\\]/g, add);

  // Inline code `...` (single line)
  protectedText = protectedText.replace(/`[^`\n]+`/g, add);

  // LaTeX inline math: $...$ and \(...\)
  protectedText = protectedText.replace(/\$(?!\$)(?:\\.|[^$\\\n])+\$(?!\$)/g, add);
  protectedText = protectedText.replace(/\\\((?:[\s\S]*?)\\\)/g, add);

  // Images: ![alt](url "title")
  protectedText = protectedText.replace(/!\[[^\]]*?\]\([^\)]*?\)/g, add);

  // Inline links: [text](url "title")
  protectedText = protectedText.replace(/\[[^\]]*?\]\([^\)]*?\)/g, add);

  // Reference links: [text][id] or [text][]
  protectedText = protectedText.replace(/\[[^\]]*?\]\[[^\]]*?\]/g, add);

  // Link definitions: [id]: url "title"
  protectedText = protectedText.replace(/^\[[^\]]+\]:[^\n]*$/gm, add);

  return { text: protectedText, placeholders };
}

function unprotectSegments(text, placeholders) {
  let result = text;
  for (let i = 0; i < placeholders.length; i += 1) {
    const key = `<<P${i}>>`;
    result = result.split(key).join(placeholders[i]);
  }
  return result;
}

function splitByBlankLines(text) {
  return text.split(/(\n{2,})/);
}

function chunkByMaxChars(text, maxChars) {
  if (text.length <= maxChars) {
    return [text];
  }
  const lines = text.split('\n');
  const chunks = [];
  let current = '';
  for (const line of lines) {
    const addition = current ? `\n${line}` : line;
    if ((current.length + addition.length) > maxChars && current) {
      chunks.push(current);
      current = line;
      continue;
    }
    current += addition;
  }
  if (current) {
    chunks.push(current);
  }
  return chunks;
}

async function openAITranslate({ baseUrl, model, apiKey, input }) {
  const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
  const system = [
    'Translate the user-provided Markdown to Simplified Chinese.',
    'Keep Markdown formatting exactly (headings, lists, spacing, punctuation, line breaks).',
    'Do NOT translate or modify placeholders like <<P0>>; keep them verbatim.',
    'Do NOT translate Roman numerals (I, II, III, IV, V, ...).',
    'Do NOT add explanations; output only the translated text.'
  ].join(' ');

  const body = {
    model,
    temperature: 0,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input }
    ]
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`OpenAI request failed: ${res.status} ${res.statusText}${errText ? ` - ${errText}` : ''}`);
  }
  const json = await res.json();
  const content = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
  if (!content || typeof content !== 'string') {
    throw new Error('OpenAI response missing message content');
  }
  return content;
}

async function ollamaTranslate({ ollamaHost, model, input }) {
  const url = `${ollamaHost.replace(/\/$/, '')}/api/chat`;
  const system = [
    'Translate the user-provided Markdown to Simplified Chinese.',
    'Keep Markdown formatting exactly (headings, lists, spacing, punctuation, line breaks).',
    'Do NOT translate or modify placeholders like <<P0>>; keep them verbatim.',
    'Do NOT translate Roman numerals (I, II, III, IV, V, ...).',
    'Do NOT add explanations; output only the translated text.'
  ].join(' ');

  const body = {
    model,
    stream: false,
    options: { temperature: 0 },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input }
    ]
  };

  let lastErr;
  for (let attempt = 1; attempt <= OLLAMA_RETRY_MAX; attempt += 1) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        const err = new Error(
          `Ollama request failed: ${res.status} ${res.statusText}${errText ? ` - ${errText}` : ''}`
        );
        if (attempt < OLLAMA_RETRY_MAX && isRetryableStatus(res.status)) {
          lastErr = err;
          await sleep(OLLAMA_RETRY_DELAY_MS * attempt);
          continue;
        }
        throw err;
      }

      const json = await res.json();
      const content = json && json.message && json.message.content;
      if (!content || typeof content !== 'string') {
        throw new Error('Ollama response missing message content');
      }
      return content;
    } catch (err) {
      if (attempt < OLLAMA_RETRY_MAX) {
        lastErr = err;
        await sleep(OLLAMA_RETRY_DELAY_MS * attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function normalizeNewlines(text) {
  return text.replace(/\r\n/g, '\n');
}

function shouldSkipTranslate(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return true;
  }
  if (/^<<P\d+>>$/.test(trimmed)) {
    return true;
  }
  return false;
}

async function translateWithCache({ cache, translator, maxChars, text }) {
  const segments = chunkByMaxChars(text, maxChars);
  const out = [];
  for (const seg of segments) {
    if (shouldSkipTranslate(seg)) {
      out.push(seg);
      continue;
    }
    const key = sha256(seg);
    if (cache.chunks[key] && typeof cache.chunks[key] === 'string') {
      out.push(cache.chunks[key]);
      continue;
    }
    const translated = await translator(seg);
    cache.chunks[key] = translated;
    out.push(translated);
  }
  return out.join('');
}

async function translateMarkdown({ cfg, cache, markdown }) {
  const normalized = normalizeNewlines(markdown);
  const { frontmatter, body } = splitFrontmatter(normalized);
  const { text: protectedBody, placeholders } = protectSegments(body);

  const parts = splitByBlankLines(protectedBody);
  const translatedParts = [];
  for (const part of parts) {
    if (/^\n{2,}$/.test(part) || shouldSkipTranslate(part)) {
      translatedParts.push(part);
      continue;
    }
    if (cfg.dryRun) {
      translatedParts.push(part);
      continue;
    }
    const provider = (cfg.provider || '').toLowerCase();
    const translated = await translateWithCache({
      cache,
      translator: async (input) => {
        if (provider === 'ollama' || (!provider && !cfg.apiKey)) {
          return ollamaTranslate({
            ollamaHost: cfg.ollamaHost,
            model: cfg.model,
            input
          });
        }
        return openAITranslate({
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          apiKey: cfg.apiKey,
          input
        });
      },
      maxChars: cfg.maxSegmentChars,
      text: part
    });
    translatedParts.push(translated);
  }

  const translatedProtected = translatedParts.join('');
  const rehydrated = unprotectSegments(translatedProtected, placeholders);
  return `${frontmatter}${rehydrated}`;
}

async function main() {
  const cfg = parseArgs();
  if (cfg.help) {
    printHelp();
    return;
  }

  if (cfg.provider === '__MISSING__') {
    throw new Error('Missing value for --provider (expected: ollama|openai). Example: --provider ollama');
  }

  if (!fs.existsSync(cfg.srcDir)) {
    throw new Error(`Source dir not found: ${cfg.srcDir}`);
  }

  const provider = (cfg.provider || '').toLowerCase();
  const usingOllama = provider === 'ollama' || (!provider && !cfg.apiKey);
  if (!cfg.dryRun && !usingOllama && !cfg.apiKey) {
    throw new Error('Missing OpenAI API key. Set OPENAI_API_KEY / --api-key, or use --provider ollama, or run with --dry-run.');
  }
  if (usingOllama && !cfg.model) {
    throw new Error('Missing model name for Ollama. Pass --model or set OPENAI_MODEL.');
  }

  const cache = readJson(cfg.cachePath) || { version: 1, chunks: {} };
  if (!cache.chunks || typeof cache.chunks !== 'object') {
    throw new Error(`Invalid cache format: ${cfg.cachePath}`);
  }
  const manifest = readJson(cfg.manifestPath) || { version: 1, files: {} };
  if (!manifest.files || typeof manifest.files !== 'object') {
    throw new Error(`Invalid manifest format: ${cfg.manifestPath}`);
  }

  const files = listMarkdownFiles(cfg.srcDir).sort();
  const limitedFiles = cfg.limit > 0 ? files.slice(0, cfg.limit) : files;

  let changed = 0;
  let skipped = 0;
  let processed = 0;

  for (const filePath of limitedFiles) {
    const rel = path.relative(cfg.srcDir, filePath);
    const outPath = path.join(cfg.outDir, rel);
    const raw = fs.readFileSync(filePath, 'utf8');
    const srcHash = sha256(normalizeNewlines(raw));

    if (!cfg.force && manifest.files[rel] && manifest.files[rel].srcHash === srcHash && fs.existsSync(outPath)) {
      skipped += 1;
      continue;
    }

    const translated = await translateMarkdown({ cfg, cache, markdown: raw });
    ensureDirForFile(outPath);

    const existing = fs.existsSync(outPath) ? fs.readFileSync(outPath, 'utf8') : '';
    if (normalizeNewlines(existing) !== normalizeNewlines(translated)) {
      fs.writeFileSync(outPath, translated, 'utf8');
      changed += 1;
    }

    manifest.files[rel] = { srcHash, updatedAt: new Date().toISOString() };
    processed += 1;
    // eslint-disable-next-line no-console
    console.log(`[${processed}/${limitedFiles.length}] ${rel}${cfg.dryRun ? ' (dry-run)' : ''}`);
  }

  writeJson(cfg.cachePath, cache);
  writeJson(cfg.manifestPath, manifest);

  // eslint-disable-next-line no-console
  console.log(`Done. Changed: ${changed}, Skipped: ${skipped}, Total: ${limitedFiles.length}`);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const express = require('express');
const jwt = require('jsonwebtoken');
const { createStore } = require('./store');
const { createContentLoader } = require('./content_loader');
const { gradeAttempt, normalizeAnswers } = require('./judge');
const { computeMastery } = require('./mastery');
const { computeStats } = require('./stats');
const { computeCalibration } = require('./calibration');
const { generateSession } = require('./session_generator');
const {
  PORT,
  HOST,
  JWT_SECRET,
  CODE_TTL_MINUTES,
  CODE_COOLDOWN_SECONDS,
  TOKEN_EXPIRES_DAYS,
  AUTH_DEBUG_CODE,
  ADMIN_TOKEN,
  assertConfig
} = require('./config');

function isValidEmail(email) {
  if (typeof email !== 'string') {
    return false;
  }
  const trimmed = email.trim();
  if (!trimmed) {
    return false;
  }
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(trimmed);
}

function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'AUTH_REQUIRED' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { id: payload.sub, email: payload.email };
    return next();
  } catch (error) {
    return res.status(401).json({ error: 'INVALID_TOKEN' });
  }
}

function adminMiddleware(req, res, next) {
  if (!ADMIN_TOKEN) {
    return next();
  }
  const token = req.headers['x-admin-token'];
  if (!token || token !== ADMIN_TOKEN) {
    return res.status(401).json({ error: 'ADMIN_REQUIRED' });
  }
  return next();
}

function getTimeBudgetSeconds(difficulty) {
  return ({ 1: 60, 2: 90, 3: 120, 4: 180, 5: 240 })[difficulty] || 120;
}

function main() {
  assertConfig();
  const store = createStore();
  const content = createContentLoader();

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use('/static', express.static(path.join(process.cwd(), 'public')));
  app.use('/assets', express.static(path.join(process.cwd(), 'content', 'assets')));
  app.use('/schemas', express.static(path.join(process.cwd(), 'schemas')));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });
  app.get('/', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
  });

  app.get('/train/session/:id', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'train-session.html'));
  });
  app.get('/login', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'login.html'));
  });
  app.get('/register', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'register.html'));
  });
  app.get('/session/new', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'session-new.html'));
  });
  app.get('/admin', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin-dashboard.html'));
  });
  app.get('/admin/exams', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin-exams.html'));
  });
  app.get('/admin/integrity', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin-integrity.html'));
  });
  app.get('/admin/calibration', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin-calibration.html'));
  });
  app.get('/admin/stats', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin-stats.html'));
  });
  app.get('/admin/question/:id/edit', (req, res) => {
    res.sendFile(path.join(process.cwd(), 'public', 'admin-question.html'));
  });

  app.post('/auth/request-code', (req, res) => {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const now = new Date();
    const cutoff = new Date(now.getTime() - CODE_COOLDOWN_SECONDS * 1000);

    const lastRequest = store.getLatestAuthCode(trimmedEmail);

    if (lastRequest && new Date(lastRequest.requested_at) > cutoff) {
      return res.status(429).json({ error: 'CODE_REQUEST_TOO_FREQUENT' });
    }

    const code = generateCode();
    const expiresAt = new Date(now.getTime() + CODE_TTL_MINUTES * 60 * 1000);

    store.insertAuthCode({
      email: trimmedEmail,
      code,
      requested_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    });

    console.log(`[auth] Verification code for ${trimmedEmail}: ${code}`);

    const payload = { sent: true, ttl_seconds: CODE_TTL_MINUTES * 60 };
    if (AUTH_DEBUG_CODE) {
      payload.debug_code = code;
    }
    return res.json(payload);
  });

  app.post('/auth/verify-code', (req, res) => {
    const { email, code } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    if (typeof code !== 'string' || !/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({ error: 'INVALID_CODE' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const now = new Date();

    const record = store.getLatestAuthCode(trimmedEmail);

    if (!record) {
      return res.status(400).json({ error: 'CODE_NOT_FOUND' });
    }

    if (record.consumed_at) {
      return res.status(400).json({ error: 'CODE_ALREADY_USED' });
    }

    if (record.code !== code) {
      return res.status(400).json({ error: 'CODE_MISMATCH' });
    }

    if (new Date(record.expires_at) < now) {
      return res.status(400).json({ error: 'CODE_EXPIRED' });
    }

    const existingUser = store.findUserByEmail(trimmedEmail);
    let userId = existingUser ? existingUser.id : null;

    if (!userId) {
      userId = crypto.randomUUID();
      store.insertUser({ id: userId, email: trimmedEmail, created_at: now.toISOString() });
    }

    store.consumeAuthCode(record.id, now.toISOString());

    const token = jwt.sign(
      { sub: userId, email: trimmedEmail },
      JWT_SECRET,
      { expiresIn: `${TOKEN_EXPIRES_DAYS}d` }
    );

    return res.json({ token, user_id: userId, expires_in_days: TOKEN_EXPIRES_DAYS });
  });

  app.post('/auth/login-email', (req, res) => {
    const { email } = req.body || {};
    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'INVALID_EMAIL' });
    }
    const trimmedEmail = email.trim().toLowerCase();
    const now = new Date();
    const existingUser = store.findUserByEmail(trimmedEmail);
    let userId = existingUser ? existingUser.id : null;
    if (!userId) {
      userId = crypto.randomUUID();
      store.insertUser({ id: userId, email: trimmedEmail, created_at: now.toISOString() });
    }
    const token = jwt.sign(
      { sub: userId, email: trimmedEmail },
      JWT_SECRET,
      { expiresIn: `${TOKEN_EXPIRES_DAYS}d` }
    );
    return res.json({ token, user_id: userId, expires_in_days: TOKEN_EXPIRES_DAYS });
  });

  app.post('/attempts', authMiddleware, (req, res) => {
    const { question_id: questionId, answers_user: answersUser, duration_ms: durationMs } = req.body || {};

    if (!questionId || typeof questionId !== 'string') {
      return res.status(400).json({ error: 'QUESTION_ID_REQUIRED' });
    }
    if (!Number.isInteger(durationMs) || durationMs < 0) {
      return res.status(400).json({ error: 'DURATION_MS_INVALID' });
    }

    const question = content.getQuestion(questionId);
    if (!question) {
      return res.status(404).json({ error: 'QUESTION_NOT_FOUND' });
    }
    const correctGroups = content.getAnswerGroups(question);
    if (!correctGroups) {
      return res.status(500).json({ error: 'ANSWER_NOT_AVAILABLE' });
    }

    const grade = gradeAttempt(question, correctGroups, answersUser);
    if (grade.errors && grade.errors.length > 0) {
      return res.status(422).json({ error: 'INVALID_ANSWER', details: grade.errors });
    }

    const answersCorrect = normalizeAnswers(correctGroups);
    const metadata = content.getQuestionMetadata(question);
    const now = new Date().toISOString();
    const difficulty = metadata.difficulty ?? (question.difficulty ? question.difficulty.level : null);
    const timeBudget = getTimeBudgetSeconds(difficulty || 3);
    const overtime = durationMs > timeBudget * 1000;

    const attemptId = store.insertAttempt({
      user_id: req.user.id,
      question_id: questionId,
      answers_user: answersUser,
      answers_correct: answersCorrect,
      is_correct: grade.isCorrect,
      per_blank: grade.perBlank,
      duration_ms: durationMs,
      difficulty: difficulty,
      tags: metadata.tags,
      pattern_id: metadata.pattern_id,
      overtime,
      created_at: now
    });

    if (metadata.pattern_id) {
      const attempts = store.listAttemptsByUser(req.user.id);
      const mastery = computeMastery(attempts, metadata.pattern_id);
      if (mastery) {
        store.upsertMastery({
          user_id: req.user.id,
          pattern_id: metadata.pattern_id,
          ...mastery,
          updated_at: now
        });
      }
    }

    return res.status(201).json({
      attempt_id: attemptId,
      user_id: req.user.id,
      question_id: questionId,
      answers_user: answersUser,
      answers_correct: answersCorrect,
      is_correct: grade.isCorrect,
      per_blank: grade.perBlank,
      duration_ms: durationMs,
      difficulty: difficulty,
      tags: metadata.tags,
      pattern_id: metadata.pattern_id,
      overtime,
      created_at: now
    });
  });

  app.get('/stats', authMiddleware, (req, res) => {
    const groupBy = req.query.group_by;
    const windowDays = req.query.window_days ? Number(req.query.window_days) : null;
    if (!['tag', 'pattern', 'difficulty'].includes(groupBy)) {
      return res.status(400).json({ error: 'INVALID_GROUP_BY' });
    }
    if (windowDays !== null && (!Number.isFinite(windowDays) || windowDays <= 0)) {
      return res.status(400).json({ error: 'INVALID_WINDOW_DAYS' });
    }
    const attempts = store.listAttemptsByUser(req.user.id);
    const stats = computeStats(attempts, groupBy, content, windowDays);
    return res.status(200).json({ group_by: groupBy, window_days: windowDays, stats });
  });

  app.get('/mastery', authMiddleware, (req, res) => {
    const mastery = store.listMasteryByUser(req.user.id);
    return res.status(200).json({ mastery });
  });

  app.get('/content/tags', (req, res) => {
    const tagIndex = content.getTagIndex();
    if (!tagIndex || !tagIndex.tags) {
      return res.status(404).json({ error: 'TAG_INDEX_NOT_FOUND' });
    }
    const tags = Object.keys(tagIndex.tags).sort();
    return res.status(200).json({ tags });
  });

  app.post('/sessions/generate', authMiddleware, (req, res) => {
    const { mode, tags, target_difficulty: targetDifficulty, size } = req.body || {};
    if (!mode || !['tag', 'review', 'daily'].includes(mode)) {
      return res.status(400).json({ error: 'INVALID_MODE' });
    }
    if (!Number.isInteger(size) || size <= 0) {
      return res.status(400).json({ error: 'INVALID_SIZE' });
    }
    if (mode === 'tag' && (!Array.isArray(tags) || tags.length === 0)) {
      return res.status(400).json({ error: 'TAGS_REQUIRED' });
    }
    if (targetDifficulty !== undefined && targetDifficulty !== null && !Number.isInteger(targetDifficulty)) {
      return res.status(400).json({ error: 'INVALID_TARGET_DIFFICULTY' });
    }

    const attempts = store.listAttemptsByUser(req.user.id);
    const session = generateSession({
      mode,
      tags: Array.isArray(tags) ? tags : [],
      targetDifficulty: targetDifficulty ?? null,
      size,
      userId: req.user.id,
      attempts,
      content
    });

    if (session.error === 'NO_CANDIDATES') {
      return res.status(404).json({ error: 'NO_CANDIDATES' });
    }

    const now = new Date().toISOString();
    const stored = store.insertSession({
      session_id: session.session_id,
      user_id: req.user.id,
      mode,
      tags: Array.isArray(tags) ? tags : [],
      target_difficulty: targetDifficulty ?? null,
      size,
      question_ids: session.question_ids,
      recommended_difficulty: session.recommended_difficulty,
      time_budget: session.time_budget,
      created_at: now
    });

    return res.status(200).json({
      session_id: stored.session_id,
      question_ids: stored.question_ids,
      recommended_difficulty: stored.recommended_difficulty,
      time_budget: stored.time_budget,
      explain: session.explain
    });
  });

  app.get('/sessions/:id', authMiddleware, (req, res) => {
    const session = store.getSessionById(req.params.id);
    if (!session || session.user_id !== req.user.id) {
      return res.status(404).json({ error: 'SESSION_NOT_FOUND' });
    }

    const questions = session.question_ids.map((questionId) => {
      const question = content.getQuestion(questionId);
      if (!question) {
        return null;
      }
      const textJa = question.original_ja?.text || question.original_text_ja || '';
      const textJaHtml = content.getExerciseHtml(questionId);
      const textZh = question.translation_zh?.text || '';
      const placeholders = [];
      const placeholderSource = textJa || textZh;
      const placeholderRegex = /\[([A-Z]+)\]/g;
      const seen = new Set();
      let match;
      while ((match = placeholderRegex.exec(placeholderSource))) {
        const groupId = match[1];
        if (seen.has(groupId)) {
          continue;
        }
        seen.add(groupId);
        placeholders.push(groupId);
      }

      const groups = [];
      if (placeholders.length > 0) {
        const placeholderMeta = question.original_ja?.placeholders || {};
        for (const groupId of placeholders) {
          const digits = placeholderMeta[groupId]?.digits;
          const blanks = groupId.split('').slice(0, digits || groupId.length);
          groups.push({ group_id: groupId, blanks });
        }
      } else if (Array.isArray(question.blanks)) {
        for (const blank of question.blanks) {
          if (!blank.id) {
            continue;
          }
          const blanks = blank.id.split('').slice(0, blank.length || blank.id.length);
          groups.push({ group_id: blank.id, blanks });
        }
      } else if (question.structure && Array.isArray(question.structure.blanks)) {
        for (const blankId of question.structure.blanks) {
          groups.push({ group_id: blankId, blanks: [blankId] });
        }
      }

      const allowed = question.blank_rules?.allowed_chars || ['-', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
      const difficulty = question.difficulty ? question.difficulty.level : session.recommended_difficulty;
      const timeBudget = ({ 1: 60, 2: 90, 3: 120, 4: 180, 5: 240 })[difficulty] || 120;

      return {
        question_id: questionId,
        text_ja: textJa,
        text_ja_html: textJaHtml,
        text_zh: textZh,
        groups,
        allowed_chars: allowed,
        pattern_id: question.pattern_id || null,
        difficulty,
        time_budget_ms: timeBudget * 1000,
        solution_outline: question.solution_outline || question.solution?.outline || [],
        solution_text: content.getSolutionText(question),
        solution_html: content.getSolutionHtml(question)
      };
    }).filter(Boolean);

    return res.status(200).json({
      session_id: session.session_id,
      question_ids: session.question_ids,
      recommended_difficulty: session.recommended_difficulty,
      time_budget: session.time_budget,
      questions
    });
  });

  app.get('/admin/api/integrity_report', adminMiddleware, (req, res) => {
    const reportPath = path.join(process.cwd(), 'content', 'index', 'integrity_report.json');
    if (!fs.existsSync(reportPath)) {
      return res.status(404).json({ error: 'REPORT_NOT_FOUND' });
    }
    const report = fs.readFileSync(reportPath, 'utf8');
    return res.type('application/json').send(report);
  });

  app.get('/admin/api/exams', adminMiddleware, (req, res) => {
    const index = content.getAllQuestionIds().map((id) => content.getQuestionIndex(id)).filter(Boolean);
    const examIds = Array.from(new Set(index.map((entry) => entry.exam_id))).sort();
    return res.status(200).json({ exams: examIds });
  });

  app.get('/admin/api/questions', adminMiddleware, (req, res) => {
    const examId = req.query.exam_id ? String(req.query.exam_id) : null;
    const index = content.getAllQuestionIds().map((id) => content.getQuestionIndex(id)).filter(Boolean);
    const filtered = examId ? index.filter((entry) => entry.exam_id === examId) : index;
    return res.status(200).json({ questions: filtered });
  });

  app.get('/admin/api/question/:id', adminMiddleware, (req, res) => {
    const question = content.getQuestion(req.params.id);
    if (!question) {
      return res.status(404).json({ error: 'QUESTION_NOT_FOUND' });
    }
    const normalizedPath = path.join(process.cwd(), 'content', 'answers', 'normalized.json');
    let answers = null;
    if (fs.existsSync(normalizedPath)) {
      const payload = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
      answers = payload.answers ? payload.answers[question.question_id] || null : null;
    }
    if (!answers) {
      answers = content.getAnswerGroups(question);
    }
    return res.status(200).json({ question, answers });
  });

  app.put('/admin/api/question/:id', adminMiddleware, (req, res) => {
    const questionId = req.params.id;
    const { question } = req.body || {};
    if (!question || typeof question !== 'object') {
      return res.status(400).json({ error: 'QUESTION_REQUIRED' });
    }
    const entry = content.getQuestionIndex(questionId);
    if (!entry || !entry.question_path) {
      return res.status(404).json({ error: 'QUESTION_NOT_FOUND' });
    }
    const filePath = path.join(process.cwd(), entry.question_path);
    require('fs').writeFileSync(filePath, JSON.stringify(question, null, 2));
    return res.status(200).json({ ok: true });
  });

  app.put('/admin/api/question/:id/answer', adminMiddleware, (req, res) => {
    const questionId = req.params.id;
    const { answers } = req.body || {};
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'ANSWERS_REQUIRED' });
    }
    const normalizedPath = path.join(process.cwd(), 'content', 'answers', 'normalized.json');
    let payload = { schema_version: 'v1', generated_at: new Date().toISOString(), answers: {} };
    if (fs.existsSync(normalizedPath)) {
      payload = JSON.parse(fs.readFileSync(normalizedPath, 'utf8'));
      if (!payload.answers) {
        payload.answers = {};
      }
    }
    payload.answers[questionId] = answers;
    payload.generated_at = new Date().toISOString();
    fs.writeFileSync(normalizedPath, JSON.stringify(payload, null, 2));
    return res.status(200).json({ ok: true });
  });

  app.post('/admin/api/question/:id/images', adminMiddleware, (req, res) => {
    const questionId = req.params.id;
    const { filename, data_base64: dataBase64, caption } = req.body || {};
    if (!filename || !dataBase64) {
      return res.status(400).json({ error: 'IMAGE_REQUIRED' });
    }
    const entry = content.getQuestionIndex(questionId);
    if (!entry || !entry.question_path) {
      return res.status(404).json({ error: 'QUESTION_NOT_FOUND' });
    }
    const ext = path.extname(filename);
    const safeName = `${Date.now()}${ext || '.png'}`;
    const assetDir = path.join(process.cwd(), 'content', 'assets', questionId);
    fs.mkdirSync(assetDir, { recursive: true });
    const filePath = path.join(assetDir, safeName);
    const buffer = Buffer.from(dataBase64, 'base64');
    fs.writeFileSync(filePath, buffer);

    const question = content.getQuestion(questionId);
    const images = Array.isArray(question.images) ? question.images : [];
    images.push({ path: `content/assets/${questionId}/${safeName}`, caption: caption || '' });
    question.images = images;
    fs.writeFileSync(path.join(process.cwd(), entry.question_path), JSON.stringify(question, null, 2));
    return res.status(200).json({ ok: true, path: `content/assets/${questionId}/${safeName}` });
  });

  app.get('/admin/api/content/search', adminMiddleware, (req, res) => {
    const tag = req.query.tag ? String(req.query.tag) : null;
    const pattern = req.query.pattern ? String(req.query.pattern) : null;
    const questionIds = new Set();
    const tagIndex = content.getTagIndex();
    if (tag && tagIndex && tagIndex.tags && tagIndex.tags[tag]) {
      for (const ids of Object.values(tagIndex.tags[tag])) {
        ids.forEach((id) => questionIds.add(id));
      }
    }
    if (pattern) {
      const patternIndex = content.getPatternIndex();
      const patternEntry = patternIndex?.patterns?.[pattern];
      if (patternEntry) {
        patternEntry.question_ids.forEach((id) => questionIds.add(id));
      }
    }
    const results = Array.from(questionIds).map((id) => content.getQuestionIndex(id)).filter(Boolean);
    return res.status(200).json({ results });
  });

  app.get('/admin/api/calibration', adminMiddleware, (req, res) => {
    const attempts = store.listAttemptsAll();
    const calibration = computeCalibration(attempts, content);
    return res.status(200).json(calibration);
  });

  app.get('/admin/api/stats', adminMiddleware, (req, res) => {
    const attempts = store.listAttemptsAll();
    const totalAttempts = attempts.length;
    const correctAttempts = attempts.filter((attempt) => attempt.is_correct).length;
    const overtimeAttempts = attempts.filter((attempt) => attempt.overtime).length;
    const activeUsers = new Set(attempts.map((attempt) => attempt.user_id)).size;
    const accuracy = totalAttempts > 0 ? Number((correctAttempts / totalAttempts).toFixed(4)) : 0;
    const overtimeRate = totalAttempts > 0 ? Number((overtimeAttempts / totalAttempts).toFixed(4)) : 0;

    const patternStats = computeStats(attempts, 'pattern', content);
    const tagStats = computeStats(attempts, 'tag', content);
    const difficultyStats = computeStats(attempts, 'difficulty', content);

    return res.status(200).json({
      totals: {
        attempts: totalAttempts,
        accuracy,
        overtime_rate: overtimeRate,
        active_users: activeUsers
      },
      patterns: patternStats,
      tags: tagStats,
      difficulty: difficultyStats
    });
  });

  const listenHost = HOST ? HOST.trim() : '';
  if (listenHost) {
    app.listen(PORT, listenHost, () => {
      console.log(`API listening on http://${listenHost}:${PORT}`);
    });
  } else {
    app.listen(PORT, () => {
      console.log(`API listening on http://localhost:${PORT}`);
    });
  }
}

main();

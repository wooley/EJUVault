const tokenInput = document.getElementById('token-input');
const tokenSave = document.getElementById('token-save');
const authPanel = document.getElementById('auth-panel');
const sessionPanel = document.getElementById('session-panel');
const sessionMeta = document.getElementById('session-meta');
const progressEl = document.getElementById('progress');
const questionStage = document.getElementById('question-stage');
const summaryEl = document.getElementById('session-summary');
const summaryTimeEl = document.getElementById('summary-time');
const summaryAccuracyEl = document.getElementById('summary-accuracy');
const summaryCorrectEl = document.getElementById('summary-correct');
const summaryListEl = document.getElementById('summary-list');
const questionText = document.getElementById('question-text');
const inputGrid = document.getElementById('input-grid');
const submitBtn = document.getElementById('submit');
const prevBtn = document.getElementById('prev');
const nextBtn = document.getElementById('next');
const feedbackEl = document.getElementById('feedback');
const solutionEl = document.getElementById('solution');
const timerEl = document.getElementById('timer');
const overtimeEl = document.getElementById('overtime');
const userEmailEl = document.getElementById('user-email');

const toggles = document.querySelectorAll('.toggle');

let authToken = localStorage.getItem('eju_token') || '';
let sessionData = null;
let currentIndex = 0;
let currentLang = 'ja';
let timerId = null;
let questionStart = null;
let activeInputs = [];
let sessionComplete = false;
const submittedQuestions = new Set();
const attemptResults = new Map();

function decodeJwtPayload(jwt) {
  if (!jwt) {
    return null;
  }
  const parts = jwt.split('.');
  if (parts.length < 2) {
    return null;
  }
  let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const pad = payload.length % 4;
  if (pad) {
    payload += '='.repeat(4 - pad);
  }
  try {
    return JSON.parse(atob(payload));
  } catch (error) {
    return null;
  }
}

function updateUserEmail() {
  if (!userEmailEl) {
    return;
  }
  const payload = decodeJwtPayload(authToken);
  const email = payload && payload.email ? payload.email : '';
  if (email) {
    userEmailEl.textContent = email;
    userEmailEl.title = email;
    userEmailEl.classList.remove('hidden');
  } else {
    userEmailEl.textContent = '';
    userEmailEl.title = '';
    userEmailEl.classList.add('hidden');
  }
}

function renderMarkdown(input) {
  if (!input) {
    return '';
  }
  let normalized = input.replace(/\r\n/g, '\n');
  normalized = normalized
    .replace(/\\\[/g, '$$')
    .replace(/\\\]/g, '$$')
    .replace(/\\\(/g, '$')
    .replace(/\\\)/g, '$');

  const lines = normalized.split('\n');
  const rebuilt = [];
  let inBlock = false;
  let blockLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!inBlock && (trimmed === '[' || trimmed === '［')) {
      inBlock = true;
      blockLines = [];
      continue;
    }
    if (inBlock && (trimmed === ']' || trimmed === '］')) {
      const block = blockLines.join('\n');
      const looksMath = /\\|\\frac|\\sqrt|\\sin|\\cos|\\tan|\\log|\\int|\\sum|\\lim|[=_^]/.test(block);
      if (looksMath) {
        rebuilt.push(`$$${block}$$`);
      } else {
        rebuilt.push('[', ...blockLines, ']');
      }
      inBlock = false;
      blockLines = [];
      continue;
    }
    if (inBlock) {
      blockLines.push(line);
    } else {
      rebuilt.push(line);
    }
  }
  if (inBlock) {
    rebuilt.push('[', ...blockLines);
  }
  normalized = rebuilt.join('\n');

  normalized = normalized.replace(/^\s*[\[［]\s*([^\n]+?)\s*[\]］]\s*$/gm, (_, math) => {
    const looksMath = /\\|\\frac|\\sqrt|\\sin|\\cos|\\tan|\\log|\\int|\\sum|\\lim|[=_^]/.test(math);
    return looksMath ? `$$${math}$$` : `[${math}]`;
  });
  normalized = normalized.replace(/\(([^()]*)\)/g, (match, inner) => {
    if (inner.includes('\\(') || inner.includes('\\)')) {
      return match;
    }
    if (inner.includes('\\')) {
      return `\\(${inner}\\)`;
    }
    return match;
  });

  const mathBlocks = [];
  normalized = normalized.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const token = `__MATH_BLOCK_${mathBlocks.length}__`;
    mathBlocks.push(math.trim());
    return token;
  });

  let rendered = normalized;
  if (window.marked) {
    rendered = window.marked.parse(normalized, { breaks: true });
  }
  rendered = rendered.replace(/__MATH_BLOCK_(\d+)__/g, (_, idx) => {
    const content = mathBlocks[Number(idx)] || '';
    return `<div class=\"math-block\">$$${content}$$</div>`;
  });
  return rendered;
}

function getSessionId() {
  const parts = window.location.pathname.split('/');
  return parts[parts.length - 1];
}

function setAuthToken(value) {
  authToken = value.trim();
  localStorage.setItem('eju_token', authToken);
  updateUserEmail();
}

function getAuthHeaders() {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${authToken}`
  };
}

function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateTimer() {
  if (!questionStart) {
    timerEl.textContent = '00:00';
    return;
  }
  const elapsed = Date.now() - questionStart;
  timerEl.textContent = formatTime(elapsed);

  const question = sessionData.questions[currentIndex];
  const overtime = elapsed > question.time_budget_ms;
  overtimeEl.classList.toggle('hidden', !overtime);
}

function resetTimer() {
  questionStart = Date.now();
  updateTimer();
  if (timerId) {
    clearInterval(timerId);
  }
  timerId = setInterval(updateTimer, 250);
}

function stopTimer() {
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  questionStart = null;
  timerEl.textContent = '00:00';
  overtimeEl.classList.add('hidden');
}

function renderQuestion() {
  if (sessionComplete) {
    showSummary();
    return;
  }
  const question = sessionData.questions[currentIndex];
  if (!question) {
    return;
  }
  questionStage.classList.remove('hidden');
  summaryEl.classList.add('hidden');
  progressEl.classList.remove('hidden');
  const useHtml = (currentLang === 'ja' && question.text_ja_html)
    || (currentLang === 'zh' && question.text_zh_html);
  const text = currentLang === 'zh' && question.text_zh ? question.text_zh : question.text_ja;
  if (useHtml) {
    questionText.innerHTML = currentLang === 'zh' ? question.text_zh_html : question.text_ja_html;
    questionText.classList.add('html');
    questionText.classList.remove('text');
  } else {
    questionText.textContent = text || 'No content available.';
    questionText.classList.add('text');
    questionText.classList.remove('html');
  }
  inputGrid.innerHTML = '';
  activeInputs = [];
  feedbackEl.textContent = '';
  feedbackEl.className = 'feedback';
  solutionEl.textContent = '';
  solutionEl.classList.add('hidden');
  nextBtn.disabled = currentIndex >= sessionData.questions.length - 1;
  submitBtn.disabled = true;
  prevBtn.disabled = currentIndex === 0;

  question.groups.forEach((group) => {
    group.blanks.forEach((blankId) => {
      const cell = document.createElement('div');
      cell.className = 'input-cell';
      const label = document.createElement('span');
      label.className = 'input-label';
      label.textContent = blankId;
      const input = document.createElement('input');
      input.dataset.blankId = blankId;
      input.dataset.groupId = group.group_id;
      input.maxLength = 1;
      input.autocomplete = 'off';
      input.inputMode = 'numeric';
      cell.appendChild(label);
      cell.appendChild(input);
      inputGrid.appendChild(cell);
      activeInputs.push(input);
    });
  });

  attachInputHandlers(question);
  resetTimer();
  updateProgress(submittedQuestions.has(currentIndex));

  if (window.renderMathInElement) {
    window.renderMathInElement(questionText, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\\\(', right: '\\\\)', display: false },
        { left: '\\\\[', right: '\\\\]', display: true }
      ],
      throwOnError: false
    });
  }
}

function attachInputHandlers(question) {
  const allowed = new Set(question.allowed_chars);

  activeInputs.forEach((input, index) => {
    input.addEventListener('input', (event) => {
      const value = event.target.value;
      if (!value) {
        updateSubmitState();
        return;
      }
      const char = value.slice(-1);
      if (!allowed.has(char)) {
        event.target.value = '';
        return;
      }
      event.target.value = char;
      const next = activeInputs[index + 1];
      if (next) {
        next.focus();
      }
      updateSubmitState();
    });

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Backspace' && !event.target.value) {
        const prev = activeInputs[index - 1];
        if (prev) {
          prev.focus();
        }
      }
    });

    input.addEventListener('paste', (event) => {
      event.preventDefault();
      const text = (event.clipboardData || window.clipboardData).getData('text');
      if (!text) {
        return;
      }
      const chars = text.split('').filter((ch) => allowed.has(ch));
      let cursor = index;
      chars.forEach((ch) => {
        const target = activeInputs[cursor];
        if (target) {
          target.value = ch;
        }
        cursor += 1;
      });
      const next = activeInputs[Math.min(cursor, activeInputs.length - 1)];
      if (next) {
        next.focus();
      }
      updateSubmitState();
    });
  });
}

function updateSubmitState() {
  const filled = activeInputs.every((input) => input.value && input.value.length === 1);
  submitBtn.disabled = !filled;
}

function buildAnswerPayload() {
  const groups = {};
  sessionData.questions[currentIndex].groups.forEach((group) => {
    groups[group.group_id] = group.blanks.map((blankId) => {
      const input = activeInputs.find((item) => item.dataset.blankId === blankId);
      return input ? input.value : '';
    }).join('');
  });
  return groups;
}

async function submitAttempt() {
  const question = sessionData.questions[currentIndex];
  const durationMs = Date.now() - questionStart;
  const payload = {
    question_id: question.question_id,
    answers_user: buildAnswerPayload(),
    duration_ms: durationMs
  };

  const response = await fetch('/attempts', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    feedbackEl.textContent = data.error || 'Submit failed.';
    feedbackEl.className = 'feedback error';
    return;
  }

  const overtime = durationMs > question.time_budget_ms;
  if (data.is_correct) {
    feedbackEl.textContent = overtime
      ? 'Correct (overtime)'
      : 'Correct';
    feedbackEl.className = 'feedback success';
  } else {
    feedbackEl.textContent = overtime
      ? 'Wrong (overtime)'
      : 'Wrong';
    feedbackEl.className = 'feedback error';
  }

  applyFeedback(data);
  recordAttemptResult(question, data, durationMs, currentIndex);
  submittedQuestions.add(currentIndex);
  updateProgress(true);
  submitBtn.disabled = true;
  nextBtn.disabled = currentIndex >= sessionData.questions.length - 1;

  if (submittedQuestions.size >= sessionData.questions.length) {
    showSummary();
  }
}

function applyFeedback(result) {
  const perBlank = result.per_blank || {};
  activeInputs.forEach((input) => {
    const blankId = input.dataset.blankId;
    const entry = perBlank[blankId];
    if (!entry) {
      return;
    }
    input.classList.toggle('correct', entry.is_correct);
    input.classList.toggle('wrong', !entry.is_correct);
    input.value = entry.expected ?? input.value;
  });
  solutionEl.textContent = '';
  solutionEl.classList.add('hidden');
}

function recordAttemptResult(question, result, durationMs, questionIndex) {
  attemptResults.set(questionIndex, {
    question_id: question.question_id,
    is_correct: result.is_correct,
    duration_ms: durationMs,
    overtime: durationMs > question.time_budget_ms
  });
}

function getSummaryStats() {
  const total = sessionData.questions.length;
  let correct = 0;
  let totalMs = 0;
  sessionData.questions.forEach((question, index) => {
    const result = attemptResults.get(index);
    if (!result) {
      return;
    }
    totalMs += result.duration_ms;
    if (result.is_correct) {
      correct += 1;
    }
  });
  const accuracy = total > 0 ? (correct / total) * 100 : 0;
  return { total, correct, totalMs, accuracy };
}

function renderSolutionContent(question, container) {
  if (container.dataset.rendered === 'true') {
    return;
  }
  if (question.solution_html) {
    container.innerHTML = question.solution_html;
    container.dataset.rendered = 'true';
    return;
  }
  let html = '';
  if (question.solution_text) {
    html = renderMarkdown(question.solution_text);
  } else if (question.solution_outline && question.solution_outline.length > 0) {
    html = renderMarkdown(question.solution_outline.join('\n'));
  } else {
    html = '<p>No solution available.</p>';
  }
  container.innerHTML = html;
  if (html && window.renderMathInElement) {
    window.renderMathInElement(container, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\\\(', right: '\\\\)', display: false },
        { left: '\\\\[', right: '\\\\]', display: true }
      ],
      throwOnError: false
    });
  }
  container.dataset.rendered = 'true';
}

function renderSummary() {
  const { total, correct, totalMs, accuracy } = getSummaryStats();
  summaryTimeEl.textContent = formatTime(totalMs);
  summaryAccuracyEl.textContent = `${Math.round(accuracy)}%`;
  summaryCorrectEl.textContent = `${correct} / ${total}`;
  summaryListEl.textContent = '';

  sessionData.questions.forEach((question, index) => {
    const result = attemptResults.get(index);
    const item = document.createElement('div');
    item.className = 'summary-item';

    const header = document.createElement('div');
    header.className = 'summary-item-header';

    const title = document.createElement('div');
    title.className = 'summary-item-title';
    title.textContent = `${index + 1}. ${question.question_id}`;

    const meta = document.createElement('div');
    meta.className = 'summary-item-meta';
    const status = document.createElement('span');
    status.className = `summary-status ${result && result.is_correct ? 'correct' : 'wrong'}`;
    status.textContent = result && result.is_correct ? 'Correct' : 'Wrong';
    const time = document.createElement('span');
    time.textContent = result ? `Time ${formatTime(result.duration_ms)}` : 'Time --:--';
    meta.appendChild(status);
    meta.appendChild(time);

    header.appendChild(title);
    header.appendChild(meta);

    const toggle = document.createElement('button');
    toggle.className = 'btn ghost summary-toggle';
    const hasSolution = Boolean(
      question.solution_html ||
      question.solution_text ||
      (question.solution_outline && question.solution_outline.length > 0)
    );
    toggle.textContent = hasSolution ? 'View solution' : 'No solution';
    toggle.disabled = !hasSolution;

    const solution = document.createElement('div');
    solution.className = 'summary-solution hidden';

    toggle.addEventListener('click', () => {
      if (solution.classList.contains('hidden')) {
        renderSolutionContent(question, solution);
        solution.classList.remove('hidden');
        toggle.textContent = 'Hide solution';
      } else {
        solution.classList.add('hidden');
        toggle.textContent = 'View solution';
      }
    });

    item.appendChild(header);
    item.appendChild(toggle);
    item.appendChild(solution);
    summaryListEl.appendChild(item);
  });
}

function showSummary() {
  sessionComplete = true;
  stopTimer();
  questionStage.classList.add('hidden');
  progressEl.classList.add('hidden');
  summaryEl.classList.remove('hidden');
  submitBtn.disabled = true;
  prevBtn.disabled = true;
  nextBtn.disabled = true;
  sessionMeta.textContent = `Session complete · ${sessionData.questions.length} questions`;
  renderSummary();
}

function updateProgress(showPattern) {
  sessionMeta.textContent = `Session ${currentIndex + 1} / ${sessionData.questions.length}`;
  const question = sessionData.questions[currentIndex];
  const budget = Math.round(question.time_budget_ms / 1000);
  if (showPattern) {
    const pattern =
      question.pattern_id === 'SEQ_CONSTRAINT_FIND_N' ? 'n/a' : (question.pattern_id || 'n/a');
    progressEl.textContent = `Time budget: ${budget}s · Pattern: ${pattern}`;
  } else {
    progressEl.textContent = `Time budget: ${budget}s`;
  }
}

function goNext() {
  if (currentIndex < sessionData.questions.length - 1) {
    currentIndex += 1;
    renderQuestion();
  }
}

function goPrev() {
  if (currentIndex > 0) {
    currentIndex -= 1;
    renderQuestion();
  }
}

async function loadSession() {
  const sessionId = getSessionId();
  if (!sessionId) {
    sessionMeta.textContent = 'Missing session id.';
    return;
  }
  if (!authToken) {
    authPanel.classList.remove('hidden');
    return;
  }
  authPanel.classList.add('hidden');
  const response = await fetch(`/sessions/${sessionId}`, {
    headers: getAuthHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    sessionMeta.textContent = data.error || 'Unable to load session.';
    return;
  }
  sessionData = data;
  currentIndex = 0;
  sessionComplete = false;
  submittedQuestions.clear();
  attemptResults.clear();
  summaryEl.classList.add('hidden');
  questionStage.classList.remove('hidden');
  renderQuestion();
}

function setup() {
  updateUserEmail();
  tokenInput.value = authToken;
  tokenSave.addEventListener('click', () => {
    setAuthToken(tokenInput.value);
    loadSession();
  });

  toggles.forEach((toggle) => {
    toggle.addEventListener('click', () => {
      toggles.forEach((btn) => btn.classList.remove('active'));
      toggle.classList.add('active');
      currentLang = toggle.dataset.lang;
      renderQuestion();
    });
  });

  submitBtn.addEventListener('click', submitAttempt);
  nextBtn.addEventListener('click', goNext);
  prevBtn.addEventListener('click', goPrev);

  loadSession();
}

setup();

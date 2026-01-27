const questionIdEl = document.getElementById('question-id');
const loadBtn = document.getElementById('load-question');
const saveQuestionBtn = document.getElementById('save-question');
const saveAnswersBtn = document.getElementById('save-answers');
const questionJson = document.getElementById('question-json');
const answersJson = document.getElementById('answers-json');
const editorStatus = document.getElementById('editor-status');
const previewEl = document.getElementById('preview');
const previewJaBtn = document.getElementById('preview-ja');
const previewZhBtn = document.getElementById('preview-zh');
const imageFile = document.getElementById('image-file');
const imageCaption = document.getElementById('image-caption');
const uploadImageBtn = document.getElementById('upload-image');
const answerEditor = document.getElementById('answer-editor');
const answerExtras = document.getElementById('answer-extras');
const answerEditorStatus = document.getElementById('answer-editor-status');
const answerEditorRefreshBtn = document.getElementById('answer-editor-refresh');
const answerSyncFromJsonBtn = document.getElementById('answer-sync-from-json');

let currentQuestion = null;
let currentGroups = [];
let groupEditorRows = [];
let extraEditorRows = [];
let isSyncingAnswers = false;

const questionId = window.location.pathname.split('/')[3];
questionIdEl.textContent = questionId || 'Unknown';

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('eju_admin_token');
  if (token) {
    headers['x-admin-token'] = token;
  }
  return headers;
}

function setStatus(message, isError) {
  editorStatus.textContent = message;
  editorStatus.style.color = isError ? '#c7332c' : '#3b3b3b';
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
      rebuilt.push(`$$${blockLines.join('\n')}$$`);
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

  normalized = normalized.replace(/^\s*[\[［]\s*([^\n]+?)\s*[\]］]\s*$/gm, (_, math) => `$$${math}$$`);

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
    return `<div class="math-block">$$${content}$$</div>`;
  });
  return rendered;
}

function renderMath() {
  if (window.renderMathInElement) {
    window.renderMathInElement(previewEl, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\(', right: '\\)', display: false },
        { left: '\\[', right: '\\]', display: true }
      ],
      throwOnError: false
    });
  }
}

function getQuestionPayload() {
  try {
    return JSON.parse(questionJson.value);
  } catch (error) {
    return null;
  }
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

function normalizeAnswersMap(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const normalized = {};
  for (const [key, value] of Object.entries(raw)) {
    normalized[key] = extractAnswerChars(value);
  }
  return normalized;
}

function getAnswersPayload() {
  try {
    const parsed = JSON.parse(answersJson.value);
    return normalizeAnswersMap(parsed);
  } catch (error) {
    return null;
  }
}

function deriveGroups(question) {
  if (!question || typeof question !== 'object') {
    return [];
  }
  const textJa = (question.original_ja && question.original_ja.text) || question.original_text_ja || '';
  const textZh = question.translation_zh && question.translation_zh.text ? question.translation_zh.text : '';
  const placeholderSource = textJa || textZh || '';
  const placeholderRegex = /[\[［]([A-Z]+)[\]］]/g;
  const seen = new Set();
  const placeholders = [];
  let match;
  while ((match = placeholderRegex.exec(placeholderSource))) {
    const groupId = match[1];
    if (!groupId || seen.has(groupId)) {
      continue;
    }
    seen.add(groupId);
    placeholders.push(groupId);
  }

  const groups = [];
  if (placeholders.length > 0) {
    const placeholderMeta = question.original_ja && question.original_ja.placeholders ? question.original_ja.placeholders : {};
    placeholders.forEach((groupId) => {
      const meta = placeholderMeta[groupId] || {};
      const digits = Number.isFinite(meta.digits) ? meta.digits : null;
      const blanks = groupId.split('').slice(0, digits || groupId.length);
      groups.push({ group_id: groupId, blanks });
    });
    return groups;
  }

  if (Array.isArray(question.blanks)) {
    question.blanks.forEach((blank) => {
      if (typeof blank === 'string') {
        const blanks = blank.split('');
        groups.push({ group_id: blank, blanks });
        return;
      }
      if (!blank || typeof blank !== 'object' || !blank.id) {
        return;
      }
      const length = Number.isFinite(blank.length) ? blank.length : blank.id.length;
      const blanks = blank.id.split('').slice(0, length || blank.id.length);
      groups.push({ group_id: blank.id, blanks });
    });
    return groups;
  }

  if (question.structure && Array.isArray(question.structure.blanks)) {
    question.structure.blanks.forEach((blank) => {
      if (typeof blank === 'string') {
        groups.push({ group_id: blank, blanks: [blank] });
        return;
      }
      if (blank && typeof blank === 'object' && blank.id) {
        groups.push({ group_id: blank.id, blanks: [blank.id] });
      }
    });
  }
  return groups;
}

function setAnswerRowState(rowState) {
  const value = rowState.groupInput.value || '';
  const expected = rowState.group.group_id.length;
  rowState.row.classList.toggle('is-missing', value.length === 0);
  rowState.row.classList.toggle('is-mismatch', value.length > 0 && value.length !== expected);
}

function collectAnswersFromEditor() {
  const payload = {};
  groupEditorRows.forEach((rowState) => {
    payload[rowState.group.group_id] = rowState.groupInput.value || '';
  });
  extraEditorRows.forEach((rowState) => {
    const key = rowState.idInput.value.trim();
    if (!key) {
      return;
    }
    payload[key] = rowState.valueInput.value || '';
  });
  return payload;
}

function updateAnswerStatus(payloadOverride) {
  if (!answerEditorStatus) {
    return;
  }
  const payload = payloadOverride || collectAnswersFromEditor();
  const groupIds = new Set(currentGroups.map((group) => group.group_id));
  const missing = [];
  const mismatch = [];
  currentGroups.forEach((group) => {
    const value = payload[group.group_id] || '';
    if (!value) {
      missing.push(group.group_id);
    } else if (value.length !== group.group_id.length) {
      mismatch.push(`${group.group_id} (${value.length}/${group.group_id.length})`);
    }
  });
  const extras = Object.keys(payload).filter((key) => !groupIds.has(key));
  const notes = [];
  if (missing.length > 0) {
    notes.push(`Missing: ${missing.join(', ')}`);
  }
  if (mismatch.length > 0) {
    notes.push(`Length mismatch: ${mismatch.join(', ')}`);
  }
  if (extras.length > 0) {
    notes.push(`Extra groups: ${extras.join(', ')}`);
  }
  answerEditorStatus.textContent = notes.join(' | ');
  answerEditorStatus.className = notes.length > 0 ? 'status error' : 'status';
}

function syncAnswersJsonFromEditor() {
  if (isSyncingAnswers) {
    return;
  }
  isSyncingAnswers = true;
  const payload = collectAnswersFromEditor();
  answersJson.value = JSON.stringify(payload, null, 2);
  updateAnswerStatus(payload);
  isSyncingAnswers = false;
}

function buildAnswerEditor(question, answers) {
  currentQuestion = question;
  currentGroups = deriveGroups(question);
  groupEditorRows = [];
  extraEditorRows = [];
  answerEditor.innerHTML = '';
  answerExtras.innerHTML = '';

  const normalized = normalizeAnswersMap(answers);
  if (currentGroups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-desc';
    empty.textContent = 'No blanks detected in the question.';
    answerEditor.appendChild(empty);
  }

  const groupIdSet = new Set(currentGroups.map((group) => group.group_id));
  currentGroups.forEach((group) => {
    const row = document.createElement('div');
    row.className = 'answer-row';

    const head = document.createElement('div');
    head.className = 'answer-row-head';

    const tag = document.createElement('div');
    tag.className = 'answer-group-tag';
    tag.textContent = group.group_id;

    const groupInput = document.createElement('input');
    groupInput.className = 'answer-group-input';
    groupInput.placeholder = `Answer for ${group.group_id}`;
    groupInput.value = normalized[group.group_id] || '';
    groupInput.autocomplete = 'off';

    head.appendChild(tag);
    head.appendChild(groupInput);
    row.appendChild(head);

    const blanksWrap = document.createElement('div');
    blanksWrap.className = 'answer-blanks';
    const blankInputs = [];
    const chars = (normalized[group.group_id] || '').split('');
    group.blanks.forEach((blankId, index) => {
      const blank = document.createElement('div');
      blank.className = 'answer-blank';

      const label = document.createElement('span');
      label.className = 'answer-blank-label';
      label.textContent = blankId;

      const input = document.createElement('input');
      input.className = 'answer-blank-input';
      input.maxLength = 1;
      input.autocomplete = 'off';
      input.value = chars[index] || '';

      blank.appendChild(label);
      blank.appendChild(input);
      blanksWrap.appendChild(blank);
      blankInputs.push(input);
    });

    if (blankInputs.length > 0) {
      row.appendChild(blanksWrap);
    }

    answerEditor.appendChild(row);

    const rowState = { row, group, groupInput, blankInputs };
    groupEditorRows.push(rowState);

    groupInput.addEventListener('input', () => {
      if (isSyncingAnswers) {
        return;
      }
      const chars = groupInput.value.split('');
      blankInputs.forEach((input, index) => {
        input.value = chars[index] || '';
      });
      setAnswerRowState(rowState);
      syncAnswersJsonFromEditor();
    });

    blankInputs.forEach((input) => {
      input.addEventListener('input', (event) => {
        if (isSyncingAnswers) {
          return;
        }
        if (event.target.value.length > 1) {
          event.target.value = event.target.value.slice(-1);
        }
        const merged = blankInputs.map((item) => item.value || '').join('');
        groupInput.value = merged;
        setAnswerRowState(rowState);
        syncAnswersJsonFromEditor();
      });
    });

    setAnswerRowState(rowState);
  });

  const extras = Object.entries(normalized).filter(([key]) => !groupIdSet.has(key));
  if (extras.length > 0) {
    const extraHeader = document.createElement('div');
    extraHeader.className = 'panel-desc';
    extraHeader.textContent = 'Extra answer groups (not found in question).';
    answerExtras.appendChild(extraHeader);
    extras.forEach(([groupId, value]) => {
      const row = document.createElement('div');
      row.className = 'answer-row is-extra';

      const head = document.createElement('div');
      head.className = 'answer-row-head';

      const idInput = document.createElement('input');
      idInput.className = 'answer-extra-input';
      idInput.placeholder = 'Group ID';
      idInput.value = groupId;
      idInput.autocomplete = 'off';

      const valueInput = document.createElement('input');
      valueInput.className = 'answer-extra-input';
      valueInput.placeholder = 'Answer';
      valueInput.value = value || '';
      valueInput.autocomplete = 'off';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'btn subtle';
      removeBtn.type = 'button';
      removeBtn.textContent = 'Remove';

      head.appendChild(idInput);
      head.appendChild(valueInput);
      head.appendChild(removeBtn);
      row.appendChild(head);
      answerExtras.appendChild(row);

      const rowState = { row, idInput, valueInput };
      extraEditorRows.push(rowState);

      const onChange = () => {
        if (isSyncingAnswers) {
          return;
        }
        syncAnswersJsonFromEditor();
      };
      idInput.addEventListener('input', onChange);
      valueInput.addEventListener('input', onChange);
      removeBtn.addEventListener('click', () => {
        row.remove();
        extraEditorRows = extraEditorRows.filter((item) => item !== rowState);
        syncAnswersJsonFromEditor();
      });
    });
  }

  updateAnswerStatus(normalized);
}

function rebuildAnswerEditorFromQuestionJson() {
  const question = getQuestionPayload();
  if (!question) {
    setStatus('Invalid question JSON.', true);
    return;
  }
  const answers = getAnswersPayload();
  if (!answers) {
    setStatus('Invalid answers JSON.', true);
    return;
  }
  buildAnswerEditor(question, answers);
  setStatus('Answer editor rebuilt.', false);
}

function rebuildAnswerEditorFromAnswersJson() {
  const answers = getAnswersPayload();
  if (!answers) {
    setStatus('Invalid answers JSON.', true);
    return;
  }
  buildAnswerEditor(currentQuestion || getQuestionPayload(), answers);
  setStatus('Answer editor synced.', false);
}

async function loadQuestion() {
  if (!questionId) {
    setStatus('Missing question id.', true);
    return;
  }
  const response = await fetch(`/admin/api/question/${questionId}`, { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Load failed.', true);
    return;
  }
  const normalizedAnswers = normalizeAnswersMap(data.answers || {});
  questionJson.value = JSON.stringify(data.question, null, 2);
  answersJson.value = JSON.stringify(normalizedAnswers, null, 2);
  buildAnswerEditor(data.question, normalizedAnswers);
  setStatus('Loaded.', false);
}

async function saveQuestion() {
  const payload = getQuestionPayload();
  if (!payload) {
    setStatus('Invalid question JSON.', true);
    return;
  }
  const response = await fetch(`/admin/api/question/${questionId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ question: payload })
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Save failed.', true);
    return;
  }
  setStatus('Question saved.', false);
}

async function saveAnswers() {
  let payload;
  try {
    payload = JSON.parse(answersJson.value);
  } catch (error) {
    setStatus('Invalid answers JSON.', true);
    return;
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    setStatus('Invalid answers JSON.', true);
    return;
  }
  payload = normalizeAnswersMap(payload);
  answersJson.value = JSON.stringify(payload, null, 2);
  const response = await fetch(`/admin/api/question/${questionId}/answer`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ answers: payload })
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Save answers failed.', true);
    return;
  }
  setStatus('Answers saved.', false);
}

function preview(lang) {
  const payload = getQuestionPayload();
  if (!payload) {
    setStatus('Invalid question JSON.', true);
    return;
  }
  const text = lang === 'zh'
    ? (payload.translation_zh && payload.translation_zh.text)
    : (payload.original_ja && payload.original_ja.text) || payload.original_text_ja;
  previewEl.innerHTML = renderMarkdown(text || '');
  renderMath();
}

async function uploadImage() {
  const file = imageFile.files[0];
  if (!file) {
    setStatus('Select an image first.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    const response = await fetch(`/admin/api/question/${questionId}/images`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        filename: file.name,
        data_base64: base64,
        caption: imageCaption.value.trim()
      })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Upload failed.', true);
      return;
    }
    setStatus(`Image uploaded: ${data.path}`, false);
  };
  reader.readAsDataURL(file);
}

loadBtn.addEventListener('click', loadQuestion);
saveQuestionBtn.addEventListener('click', saveQuestion);
saveAnswersBtn.addEventListener('click', saveAnswers);
previewJaBtn.addEventListener('click', () => preview('ja'));
previewZhBtn.addEventListener('click', () => preview('zh'));
uploadImageBtn.addEventListener('click', uploadImage);
if (answerEditorRefreshBtn) {
  answerEditorRefreshBtn.addEventListener('click', rebuildAnswerEditorFromQuestionJson);
}
if (answerSyncFromJsonBtn) {
  answerSyncFromJsonBtn.addEventListener('click', rebuildAnswerEditorFromAnswersJson);
}

loadQuestion();

const tokenInput = document.getElementById('admin-token');
const tokenSave = document.getElementById('admin-save');
const integrityReport = document.getElementById('integrity-report');
const calibrationReport = document.getElementById('calibration-report');
const searchTag = document.getElementById('search-tag');
const searchPattern = document.getElementById('search-pattern');
const searchBtn = document.getElementById('search-btn');
const searchResults = document.getElementById('search-results');

const examSelect = document.getElementById('exam-select');
const questionSelect = document.getElementById('question-select');
const loadQuestionBtn = document.getElementById('load-question');
const questionJson = document.getElementById('question-json');
const answersJson = document.getElementById('answers-json');
const saveQuestionBtn = document.getElementById('save-question');
const saveAnswersBtn = document.getElementById('save-answers');
const imageFile = document.getElementById('image-file');
const imageCaption = document.getElementById('image-caption');
const uploadImageBtn = document.getElementById('upload-image');
const editorStatus = document.getElementById('editor-status');

let adminToken = localStorage.getItem('eju_admin_token') || '';
let currentQuestionId = null;

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (adminToken) {
    headers['x-admin-token'] = adminToken;
  }
  return headers;
}

function setEditorStatus(message, isError) {
  editorStatus.textContent = message;
  editorStatus.style.color = isError ? '#c7332c' : '#3b3b3b';
}

async function loadIntegrity() {
  const response = await fetch('/admin/api/integrity_report', { headers: getHeaders() });
  const text = await response.text();
  integrityReport.textContent = response.ok ? text : 'Unable to load report.';
}

async function loadCalibration() {
  const response = await fetch('/admin/api/calibration', { headers: getHeaders() });
  const text = await response.text();
  calibrationReport.textContent = response.ok ? text : 'Unable to load calibration.';
}

async function runSearch() {
  const tag = searchTag.value.trim();
  const pattern = searchPattern.value.trim();
  const params = new URLSearchParams();
  if (tag) {
    params.set('tag', tag);
  }
  if (pattern) {
    params.set('pattern', pattern);
  }
  if (!tag && !pattern) {
    searchResults.textContent = 'Enter a tag or pattern.';
    return;
  }
  const response = await fetch(`/admin/api/content/search?${params.toString()}`, { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    searchResults.textContent = data.error || 'Search failed.';
    return;
  }
  const items = data.results || [];
  if (items.length === 0) {
    searchResults.textContent = 'No matches.';
    return;
  }
  searchResults.innerHTML = '';
  items.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = item.question_id;
    const sub = document.createElement('div');
    sub.className = 'result-sub';
    sub.textContent = `Pattern: ${item.pattern_id || 'n/a'} · Difficulty: ${item.difficulty_level || 'n/a'}`;
    card.appendChild(title);
    card.appendChild(sub);
    searchResults.appendChild(card);
  });
}

async function loadExams() {
  const response = await fetch('/admin/api/exams', { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    setEditorStatus(data.error || 'Unable to load exams.', true);
    return;
  }
  examSelect.innerHTML = '';
  (data.exams || []).forEach((exam) => {
    const option = document.createElement('option');
    option.value = exam;
    option.textContent = exam;
    examSelect.appendChild(option);
  });
  if (examSelect.value) {
    await loadQuestionsForExam(examSelect.value);
  }
}

async function loadQuestionsForExam(examId) {
  const response = await fetch(`/admin/api/questions?exam_id=${encodeURIComponent(examId)}`, {
    headers: getHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    setEditorStatus(data.error || 'Unable to load questions.', true);
    return;
  }
  questionSelect.innerHTML = '';
  (data.questions || []).forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.question_id;
    option.textContent = entry.question_id;
    questionSelect.appendChild(option);
  });
}

async function loadQuestion() {
  const questionId = questionSelect.value;
  if (!questionId) {
    return;
  }
  const response = await fetch(`/admin/api/question/${questionId}`, { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    setEditorStatus(data.error || 'Load failed.', true);
    return;
  }
  currentQuestionId = questionId;
  questionJson.value = JSON.stringify(data.question, null, 2);
  answersJson.value = JSON.stringify(data.answers || {}, null, 2);
  setEditorStatus('Loaded.', false);
}

async function saveQuestion() {
  if (!currentQuestionId) {
    setEditorStatus('Load a question first.', true);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(questionJson.value);
  } catch (error) {
    setEditorStatus('Invalid question JSON.', true);
    return;
  }
  const response = await fetch(`/admin/api/question/${currentQuestionId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ question: payload })
  });
  const data = await response.json();
  if (!response.ok) {
    setEditorStatus(data.error || 'Save failed.', true);
    return;
  }
  setEditorStatus('Question saved.', false);
}

async function saveAnswers() {
  if (!currentQuestionId) {
    setEditorStatus('Load a question first.', true);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(answersJson.value);
  } catch (error) {
    setEditorStatus('Invalid answers JSON.', true);
    return;
  }
  const response = await fetch(`/admin/api/question/${currentQuestionId}/answer`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ answers: payload })
  });
  const data = await response.json();
  if (!response.ok) {
    setEditorStatus(data.error || 'Save answers failed.', true);
    return;
  }
  setEditorStatus('Answers saved.', false);
}

async function uploadImage() {
  if (!currentQuestionId) {
    setEditorStatus('Load a question first.', true);
    return;
  }
  const file = imageFile.files[0];
  if (!file) {
    setEditorStatus('Select an image first.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = async () => {
    const base64 = reader.result.split(',')[1];
    const response = await fetch(`/admin/api/question/${currentQuestionId}/images`, {
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
      setEditorStatus(data.error || 'Upload failed.', true);
      return;
    }
    setEditorStatus(`Image uploaded: ${data.path}`, false);
  };
  reader.readAsDataURL(file);
}

function setup() {
  tokenInput.value = adminToken;
  tokenSave.addEventListener('click', () => {
    adminToken = tokenInput.value.trim();
    localStorage.setItem('eju_admin_token', adminToken);
    loadIntegrity();
    loadCalibration();
    loadExams();
  });
  examSelect.addEventListener('change', (event) => {
    loadQuestionsForExam(event.target.value);
  });
  loadQuestionBtn.addEventListener('click', loadQuestion);
  saveQuestionBtn.addEventListener('click', saveQuestion);
  saveAnswersBtn.addEventListener('click', saveAnswers);
  uploadImageBtn.addEventListener('click', uploadImage);
  searchBtn.addEventListener('click', runSearch);

  loadIntegrity();
  loadCalibration();
  loadExams();
}

setup();

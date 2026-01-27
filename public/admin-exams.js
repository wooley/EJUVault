const examList = document.getElementById('exam-list');
const examQuestions = document.getElementById('exam-questions');
const examSummary = document.getElementById('exam-summary');
let activeExamId = null;

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('eju_admin_token');
  if (token) {
    headers['x-admin-token'] = token;
  }
  return headers;
}

function setActiveExam(examId) {
  activeExamId = examId;
  const cards = examList.querySelectorAll('.exam-card');
  cards.forEach((card) => {
    card.classList.toggle('active', card.dataset.examId === examId);
  });
}

async function loadExams() {
  const response = await fetch('/admin/api/exams', { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    examSummary.textContent = data.error || 'Unable to load exams.';
    return;
  }
  const exams = data.exams || [];
  examList.innerHTML = '';
  exams.forEach((examId) => {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'exam-card';
    card.dataset.examId = examId;
    card.textContent = examId;
    card.addEventListener('click', () => {
      setActiveExam(examId);
      loadQuestions(examId);
    });
    examList.appendChild(card);
  });
  if (exams.length === 0) {
    examSummary.textContent = 'No exams found.';
    examQuestions.innerHTML = '';
    return;
  }
  const initialExam = exams[0];
  setActiveExam(initialExam);
  loadQuestions(initialExam);
}

function groupBySection(questions) {
  const map = new Map();
  questions.forEach((q) => {
    const section = q.section || 'Unknown';
    if (!map.has(section)) {
      map.set(section, []);
    }
    map.get(section).push(q);
  });
  for (const list of map.values()) {
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
  return map;
}

async function loadQuestions(examId) {
  const response = await fetch(`/admin/api/questions?exam_id=${encodeURIComponent(examId)}`, {
    headers: getHeaders()
  });
  const data = await response.json();
  if (!response.ok) {
    examSummary.textContent = data.error || 'Unable to load questions.';
    return;
  }
  const questions = data.questions || [];
  examSummary.textContent = `Exam ${examId} · Total questions: ${questions.length}`;
  const groups = groupBySection(questions);
  examQuestions.innerHTML = '';
  for (const [section, list] of groups.entries()) {
    const sectionCard = document.createElement('div');
    sectionCard.className = 'result-card';
    const title = document.createElement('div');
    title.className = 'result-title';
    title.textContent = `Section ${section}`;
    sectionCard.appendChild(title);

    list.forEach((q) => {
      const row = document.createElement('div');
      row.className = 'result-sub';
      row.innerHTML = `<a href="/admin/question/${q.question_id}/edit">${q.question_id}</a>`;
      sectionCard.appendChild(row);
    });

    examQuestions.appendChild(sectionCard);
  }
}

loadExams();

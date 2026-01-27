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
  const sequence = Array.isArray(data.sequence) && data.sequence.length > 0
    ? data.sequence
    : buildSequenceFromQuestions(questions);
  const questionIds = sequence.map((entry) => entry.question_id).filter(Boolean);
  sessionStorage.setItem('admin_exam_id', examId);
  sessionStorage.setItem('admin_exam_questions', JSON.stringify(questionIds));
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
      row.innerHTML = `<a href="/admin/question/${q.question_id}/edit?exam_id=${encodeURIComponent(examId)}">${q.question_id}</a>`;
      sectionCard.appendChild(row);
    });

    examQuestions.appendChild(sectionCard);
  }
}

function buildSequenceFromQuestions(questions) {
  const sectionOrder = new Map([['I', 1], ['II', 2], ['III', 3], ['IV', 4]]);
  return questions
    .slice()
    .sort((a, b) => {
      const sectionRankA = sectionOrder.get(a.section) || 99;
      const sectionRankB = sectionOrder.get(b.section) || 99;
      if (sectionRankA !== sectionRankB) {
        return sectionRankA - sectionRankB;
      }
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return String(a.question_id || '').localeCompare(String(b.question_id || ''));
    })
    .map((entry) => ({
      question_id: entry.question_id,
      section: entry.section || null,
      order: entry.order ?? null
    }));
}

loadExams();

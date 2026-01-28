const windowInput = document.getElementById('window-days');
const minAttemptsInput = document.getElementById('min-attempts');
const applyFiltersBtn = document.getElementById('apply-filters');
const resetFiltersBtn = document.getElementById('reset-filters');
const statusEl = document.getElementById('stats-status');
const cardsEl = document.getElementById('stats-cards');
const tablePatterns = document.getElementById('table-patterns');
const tableTags = document.getElementById('table-tags');

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('eju_admin_token');
  if (token) {
    headers['x-admin-token'] = token;
  }
  return headers;
}

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.classList.toggle('error', Boolean(isError));
}

function formatRate(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '--';
  }
  return `${(num * 100).toFixed(1)}%`;
}

function formatInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return '0';
  }
  return String(num);
}

function renderCards(totals) {
  cardsEl.innerHTML = '';
  const cards = [
    { label: 'Total Attempts', value: formatInt(totals.attempts) },
    { label: 'Accuracy', value: formatRate(totals.accuracy) },
    { label: 'Overtime Rate', value: formatRate(totals.overtime_rate) },
    { label: 'Active Users', value: formatInt(totals.active_users) }
  ];
  cards.forEach((card) => {
    const el = document.createElement('div');
    el.className = 'stat-card';
    const label = document.createElement('div');
    label.className = 'stat-card-label';
    label.textContent = card.label;
    const value = document.createElement('div');
    value.className = 'stat-card-value';
    value.textContent = card.value;
    el.appendChild(label);
    el.appendChild(value);
    cardsEl.appendChild(el);
  });
}

function renderTableRows(tbody, rows, emptyLabel) {
  tbody.innerHTML = '';
  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 4;
    td.className = 'empty-cell';
    td.textContent = emptyLabel;
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  rows.forEach((row) => {
    const tr = document.createElement('tr');
    row.forEach((cell) => {
      const td = document.createElement('td');
      td.textContent = cell;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const windowDays = params.get('window_days');
  const minAttempts = params.get('min_attempts');
  if (windowDays) {
    windowInput.value = windowDays;
  }
  if (minAttempts) {
    minAttemptsInput.value = minAttempts;
  }
}

function buildQuery() {
  const params = new URLSearchParams();
  const windowDays = windowInput.value.trim();
  const minAttempts = minAttemptsInput.value.trim();
  if (windowDays) {
    params.set('window_days', windowDays);
  }
  if (minAttempts) {
    params.set('min_attempts', minAttempts);
  }
  const query = params.toString();
  return query ? `?${query}` : '';
}

function applyFilters() {
  const query = buildQuery();
  const nextUrl = `${window.location.pathname}${query}`;
  window.history.replaceState(null, '', nextUrl);
  loadStats();
}

function resetFilters() {
  windowInput.value = '';
  minAttemptsInput.value = '';
  applyFilters();
}

async function loadStats() {
  setStatus('Loading...', false);
  const query = buildQuery();
  const response = await fetch(`/admin/api/stats${query}`, { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Failed to load stats.', true);
    return;
  }

  renderCards(data.totals || {});

  const patternRows = Object.entries(data.patterns || {})
    .sort(([, a], [, b]) => b.attempts - a.attempts)
    .slice(0, 12)
    .map(([key, entry]) => [
      key,
      formatInt(entry.attempts),
      formatRate(entry.accuracy),
      formatRate(entry.overtime_rate)
    ]);

  const tagRows = Object.entries(data.tags || {})
    .sort(([, a], [, b]) => a.accuracy - b.accuracy)
    .slice(0, 12)
    .map(([key, entry]) => [
      key,
      formatInt(entry.attempts),
      formatRate(entry.accuracy),
      formatRate(1 - Number(entry.accuracy || 0))
    ]);

  renderTableRows(tablePatterns, patternRows, 'No patterns in range.');
  renderTableRows(tableTags, tagRows, 'No tags in range.');

  setStatus('Updated.', false);
}

applyFiltersBtn.addEventListener('click', applyFilters);
resetFiltersBtn.addEventListener('click', resetFilters);

readFiltersFromUrl();
loadStats();

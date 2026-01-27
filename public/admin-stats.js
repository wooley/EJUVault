const statsCards = document.getElementById('stats-cards');
const patternsTable = document.getElementById('patterns-table');
const tagsTable = document.getElementById('tags-table');

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('eju_admin_token');
  if (token) {
    headers['x-admin-token'] = token;
  }
  return headers;
}

function formatPercent(value) {
  if (value === null || value === undefined) {
    return '-';
  }
  return `${(value * 100).toFixed(1)}%`;
}

function formatNumber(value) {
  if (value === null || value === undefined) {
    return '-';
  }
  return value.toLocaleString('en-US');
}

function buildCard(label, value, hint) {
  const card = document.createElement('div');
  card.className = 'stats-card';

  const title = document.createElement('div');
  title.className = 'stats-label';
  title.textContent = label;

  const metric = document.createElement('div');
  metric.className = 'stats-value';
  metric.textContent = value;

  card.appendChild(title);
  card.appendChild(metric);

  if (hint) {
    const sub = document.createElement('div');
    sub.className = 'stats-hint';
    sub.textContent = hint;
    card.appendChild(sub);
  }
  return card;
}

function renderCards(totals) {
  statsCards.innerHTML = '';
  if (!totals) {
    const empty = document.createElement('div');
    empty.className = 'panel-desc';
    empty.textContent = 'No stats available yet.';
    statsCards.appendChild(empty);
    return;
  }
  statsCards.appendChild(buildCard('Total Attempts', formatNumber(totals.attempts)));
  statsCards.appendChild(buildCard('Accuracy', formatPercent(totals.accuracy)));
  statsCards.appendChild(buildCard('Overtime Rate', formatPercent(totals.overtime_rate)));
  statsCards.appendChild(buildCard('Active Users', formatNumber(totals.active_users)));
}

function renderTableRows(tbody, rows) {
  tbody.innerHTML = '';
  if (!rows.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 4;
    cell.className = 'stats-empty';
    cell.textContent = 'No data yet.';
    row.appendChild(cell);
    tbody.appendChild(row);
    return;
  }

  rows.forEach((entry) => {
    const row = document.createElement('tr');

    const name = document.createElement('td');
    name.textContent = entry.name;

    const attempts = document.createElement('td');
    attempts.textContent = formatNumber(entry.attempts);

    const accuracy = document.createElement('td');
    accuracy.textContent = formatPercent(entry.accuracy);

    const overtime = document.createElement('td');
    overtime.textContent = formatPercent(entry.overtime_rate);

    row.appendChild(name);
    row.appendChild(attempts);
    row.appendChild(accuracy);
    row.appendChild(overtime);
    tbody.appendChild(row);
  });
}

function buildPatternRows(stats) {
  const rows = Object.entries(stats || {}).map(([key, value]) => ({
    name: key,
    attempts: value.attempts || 0,
    accuracy: value.accuracy ?? 0,
    overtime_rate: value.overtime_rate ?? 0
  }));
  rows.sort((a, b) => b.attempts - a.attempts);
  return rows.slice(0, 10);
}

function buildWrongTagRows(stats) {
  const rows = Object.entries(stats || {}).map(([key, value]) => ({
    name: key,
    attempts: value.attempts || 0,
    accuracy: value.accuracy ?? 0,
    overtime_rate: value.overtime_rate ?? 0
  }));
  const filtered = rows.filter((row) => row.attempts >= 3);
  filtered.sort((a, b) => {
    if (a.accuracy !== b.accuracy) {
      return a.accuracy - b.accuracy;
    }
    return b.attempts - a.attempts;
  });
  return filtered.slice(0, 10);
}

async function loadStats() {
  const response = await fetch('/admin/api/stats', { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    statsCards.innerHTML = '';
    const error = document.createElement('div');
    error.className = 'panel-desc';
    error.textContent = data.error || 'Unable to load stats.';
    statsCards.appendChild(error);
    renderTableRows(patternsTable, []);
    renderTableRows(tagsTable, []);
    return;
  }
  renderCards(data.totals);
  renderTableRows(patternsTable, buildPatternRows(data.patterns));
  renderTableRows(tagsTable, buildWrongTagRows(data.tags));
}

loadStats();

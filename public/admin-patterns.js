const tableBody = document.getElementById('pattern-table');
const addPatternBtn = document.getElementById('add-pattern');
const savePatternsBtn = document.getElementById('save-patterns');
const statusEl = document.getElementById('patterns-status');

let rows = [];

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

function parseList(value) {
  if (!value) {
    return [];
  }
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatList(list) {
  if (!Array.isArray(list)) {
    return '';
  }
  return list.join('\n');
}

function buildRow(pattern = {}) {
  const row = document.createElement('tr');

  const patternIdInput = document.createElement('input');
  patternIdInput.type = 'text';
  patternIdInput.value = pattern.pattern_id || '';

  const triggerInput = document.createElement('textarea');
  triggerInput.rows = 4;
  triggerInput.value = formatList(pattern.trigger_rules);

  const coreInput = document.createElement('textarea');
  coreInput.rows = 4;
  coreInput.value = formatList(pattern.core_steps);

  const errorInput = document.createElement('textarea');
  errorInput.rows = 4;
  errorInput.value = formatList(pattern.common_errors);

  const relatedInput = document.createElement('textarea');
  relatedInput.rows = 4;
  relatedInput.value = formatList(pattern.related_tags);

  const versionInput = document.createElement('input');
  versionInput.type = 'text';
  versionInput.value = pattern.version || '';

  const removeBtn = document.createElement('button');
  removeBtn.className = 'btn subtle';
  removeBtn.type = 'button';
  removeBtn.textContent = 'Remove';

  const cells = [
    patternIdInput,
    triggerInput,
    coreInput,
    errorInput,
    relatedInput,
    versionInput
  ];

  cells.forEach((input) => {
    const td = document.createElement('td');
    td.appendChild(input);
    row.appendChild(td);
  });

  const removeCell = document.createElement('td');
  removeCell.appendChild(removeBtn);
  row.appendChild(removeCell);

  tableBody.appendChild(row);

  const rowState = {
    row,
    patternIdInput,
    triggerInput,
    coreInput,
    errorInput,
    relatedInput,
    versionInput
  };

  rows.push(rowState);

  removeBtn.addEventListener('click', () => {
    row.remove();
    rows = rows.filter((item) => item !== rowState);
  });
}

function collectPatterns() {
  const errors = [];
  const patterns = rows.map((row) => {
    const patternId = row.patternIdInput.value.trim();
    if (!patternId) {
      errors.push('Pattern ID is required.');
    }
    return {
      pattern_id: patternId,
      trigger_rules: parseList(row.triggerInput.value),
      core_steps: parseList(row.coreInput.value),
      common_errors: parseList(row.errorInput.value),
      related_tags: parseList(row.relatedInput.value),
      version: row.versionInput.value.trim()
    };
  });
  return { patterns, errors };
}

async function loadPatterns() {
  setStatus('Loading...', false);
  const response = await fetch('/admin/api/patterns', { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Failed to load patterns.', true);
    return;
  }
  const patterns = Array.isArray(data) ? data : data.patterns || [];
  tableBody.innerHTML = '';
  rows = [];
  patterns.forEach((pattern) => buildRow(pattern));
  setStatus('Loaded.', false);
}

async function savePatterns() {
  const { patterns, errors } = collectPatterns();
  if (errors.length) {
    setStatus(errors[0], true);
    return;
  }
  const response = await fetch('/admin/api/patterns', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ patterns })
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Save failed.', true);
    return;
  }
  setStatus('Saved.', false);
}

addPatternBtn.addEventListener('click', () => buildRow());
savePatternsBtn.addEventListener('click', savePatterns);

loadPatterns();

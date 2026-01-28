const addCategoryBtn = document.getElementById('add-category');
const saveTagsBtn = document.getElementById('save-tags');
const categoriesEl = document.getElementById('tag-categories');
const statusEl = document.getElementById('tags-status');

let categoryRows = [];

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

function buildCategoryRow(category = '', tags = []) {
  const row = document.createElement('div');
  row.className = 'category-card';

  const header = document.createElement('div');
  header.className = 'category-head';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Category name';
  nameInput.value = category;

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn subtle';
  removeBtn.textContent = 'Remove';

  header.appendChild(nameInput);
  header.appendChild(removeBtn);

  const tagsInput = document.createElement('textarea');
  tagsInput.rows = 4;
  tagsInput.placeholder = 'Tags, one per line';
  tagsInput.value = formatList(tags);

  row.appendChild(header);
  row.appendChild(tagsInput);
  categoriesEl.appendChild(row);

  const rowState = { row, nameInput, tagsInput };
  categoryRows.push(rowState);

  removeBtn.addEventListener('click', () => {
    row.remove();
    categoryRows = categoryRows.filter((item) => item !== rowState);
  });
}

function collectTags() {
  const tags = {};
  const errors = [];
  categoryRows.forEach((row) => {
    const name = row.nameInput.value.trim();
    if (!name) {
      errors.push('Category name is required.');
      return;
    }
    if (tags[name]) {
      errors.push(`Duplicate category: ${name}`);
      return;
    }
    tags[name] = parseList(row.tagsInput.value);
  });
  return { tags, errors };
}

async function loadTags() {
  setStatus('Loading...', false);
  const response = await fetch('/admin/api/tags', { headers: getHeaders() });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Failed to load tags.', true);
    return;
  }
  const tags = Array.isArray(data) ? {} : data.tags || data;
  categoriesEl.innerHTML = '';
  categoryRows = [];
  Object.entries(tags).forEach(([category, list]) => {
    buildCategoryRow(category, list);
  });
  setStatus('Loaded.', false);
}

async function saveTags() {
  const { tags, errors } = collectTags();
  if (errors.length) {
    setStatus(errors[0], true);
    return;
  }
  const response = await fetch('/admin/api/tags', {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify({ tags })
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Save failed.', true);
    return;
  }
  setStatus('Saved.', false);
}

addCategoryBtn.addEventListener('click', () => buildCategoryRow());
saveTagsBtn.addEventListener('click', saveTags);

loadTags();

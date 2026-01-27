const modeSelect = document.getElementById('mode');
const scopeSelect = document.getElementById('scope');
const difficultySelect = document.getElementById('difficulty');
const sizeInput = document.getElementById('size');
const generateBtn = document.getElementById('generate');
const statusEl = document.getElementById('status');
const userEmailEl = document.getElementById('user-email');
const loginLink = document.getElementById('login-link');

let token = localStorage.getItem('eju_token') || '';

function setStatus(message, isError) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? '#c7332c' : '#3b3b3b';
}

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
  token = localStorage.getItem('eju_token') || '';
  const payload = decodeJwtPayload(token);
  const email = payload && payload.email ? payload.email : '';
  if (!userEmailEl || !loginLink) {
    return;
  }
  if (email) {
    userEmailEl.textContent = email;
    userEmailEl.title = email;
    userEmailEl.classList.remove('hidden');
    loginLink.classList.add('hidden');
    loginLink.setAttribute('aria-hidden', 'true');
  } else {
    userEmailEl.textContent = '';
    userEmailEl.title = '';
    userEmailEl.classList.add('hidden');
    loginLink.classList.remove('hidden');
    loginLink.removeAttribute('aria-hidden');
  }
}

async function loadScopes() {
  const response = await fetch('/content/tags');
  const data = await response.json();
  if (!response.ok) {
    scopeSelect.innerHTML = '<option value="">Failed to load</option>';
    return;
  }
  scopeSelect.innerHTML = '';
  const all = document.createElement('option');
  all.value = '';
  all.textContent = 'All';
  scopeSelect.appendChild(all);
  (data.tags || []).forEach((tag) => {
    const option = document.createElement('option');
    option.value = tag;
    option.textContent = tag;
    scopeSelect.appendChild(option);
  });
}

function handleModeChange() {
  const mode = modeSelect.value;
  const disabled = mode !== 'tag';
  scopeSelect.disabled = disabled;
}

async function generateSession() {
  if (!token) {
    setStatus('Please login first.', true);
    return;
  }
  const mode = modeSelect.value;
  const size = Number(sizeInput.value) || 5;
  const scope = scopeSelect.value;
  const targetDifficulty = difficultySelect.value ? Number(difficultySelect.value) : null;

  if (mode === 'tag' && !scope) {
    setStatus('Tag mode requires a scope.', true);
    return;
  }

  const payload = {
    mode,
    tags: mode === 'tag' ? [scope] : [],
    size,
    target_difficulty: Number.isInteger(targetDifficulty) ? targetDifficulty : null
  };

  const response = await fetch('/sessions/generate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) {
    setStatus(data.error || 'Generation failed.', true);
    return;
  }
  window.location.href = `/train/session/${data.session_id}`;
}

modeSelect.addEventListener('change', handleModeChange);
generateBtn.addEventListener('click', generateSession);

handleModeChange();
loadScopes();
updateUserEmail();

const emailInput = document.getElementById('email');
const codeInput = document.getElementById('code');
const requestBtn = document.getElementById('request-code');
const verifyBtn = document.getElementById('verify-code');
const authStatus = document.getElementById('auth-status');
let isBusy = false;

function setStatus(message, isError) {
  authStatus.textContent = message;
  authStatus.style.color = isError ? '#c7332c' : '#3b3b3b';
}

function isCodeValid() {
  return /^[0-9]{6}$/.test(codeInput.value.trim());
}

function setBusy(busy) {
  isBusy = busy;
  requestBtn.disabled = busy;
  verifyBtn.disabled = busy || !isCodeValid();
}

function updateVerifyState() {
  verifyBtn.disabled = isBusy || !isCodeValid();
}

function sanitizeCodeInput() {
  codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 6);
  updateVerifyState();
}

async function requestCode() {
  const email = emailInput.value.trim();
  if (!email) {
    setStatus('Email required.', true);
    return;
  }
  setBusy(true);
  try {
    const response = await fetch('/auth/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Request failed.', true);
      setBusy(false);
      return;
    }
    let message = 'Code sent. Check server logs for the code.';
    if (data.debug_code) {
      codeInput.value = data.debug_code;
      message = `Code sent. Debug code: ${data.debug_code}`;
    }
    setStatus(message, false);
  } catch (error) {
    setStatus('Request failed.', true);
  } finally {
    setBusy(false);
  }
}

async function verifyCode() {
  const email = emailInput.value.trim();
  const code = codeInput.value.trim();
  if (!email) {
    setStatus('Email required.', true);
    return;
  }
  if (!isCodeValid()) {
    setStatus('6-digit code required.', true);
    return;
  }
  setBusy(true);
  try {
    const response = await fetch('/auth/verify-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });
    const data = await response.json();
    if (!response.ok) {
      setStatus(data.error || 'Verification failed.', true);
      setBusy(false);
      return;
    }
    localStorage.setItem('eju_token', data.token);
    setStatus('Signed in. Redirecting to session builder...', false);
    window.location.href = '/session/new';
  } catch (error) {
    setStatus('Verification failed.', true);
  } finally {
    setBusy(false);
  }
}

codeInput.addEventListener('input', sanitizeCodeInput);
requestBtn.addEventListener('click', requestCode);
verifyBtn.addEventListener('click', verifyCode);
setBusy(false);

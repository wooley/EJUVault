const reportEl = document.getElementById('calibration-report');

function getHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('eju_admin_token');
  if (token) {
    headers['x-admin-token'] = token;
  }
  return headers;
}

async function loadReport() {
  const response = await fetch('/admin/api/calibration', { headers: getHeaders() });
  const text = await response.text();
  reportEl.textContent = response.ok ? text : 'Unable to load calibration.';
}

loadReport();

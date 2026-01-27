const tokenInput = document.getElementById('admin-token');
const tokenSave = document.getElementById('admin-save');

let adminToken = localStorage.getItem('eju_admin_token') || '';

tokenInput.value = adminToken;

tokenSave.addEventListener('click', () => {
  adminToken = tokenInput.value.trim();
  localStorage.setItem('eju_admin_token', adminToken);
});

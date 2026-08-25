'use strict';
async function login() {
  const btn = document.getElementById('b');
  const m = document.getElementById('m');
  m.className = 'msg';
  btn.disabled = true;
  try {
    const r = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('u').value.trim(), password: document.getElementById('p').value })
    });
    if (r.ok) {
      const d = await r.json().catch(() => ({}));
      location.href = d.redirect || '/';
      return;
    }
    const d = await r.json().catch(() => ({}));
    m.textContent = d.message || 'Usuário ou senha inválidos.';
    m.classList.add('show');
  } catch (_) {
    m.textContent = 'Erro de conexão com o servidor.';
    m.classList.add('show');
  }
  btn.disabled = false;
}
document.getElementById('b').addEventListener('click', login);
document.getElementById('p').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
document.getElementById('u').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('p').focus(); });

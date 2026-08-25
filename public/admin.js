
'use strict';
let myRole = 'mod';

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: Object.assign({'Content-Type':'application/json'}),
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch(_){}
  data._status = res.status;
  return data;
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = 'msg show ' + (ok ? 'ok' : 'err');
  setTimeout(() => { el.className = 'msg'; }, 3500);
}

async function boot() {
  const me = await api('/api/admin/me');
  if (me._status !== 200) { location.reload(); return; } // sem sessÃ£o -> servidor mostra a tela de login no mesmo endereÃ§o secreto
  myRole = me.admin.role || 'mod';
  const cargo = myRole === 'owner' ? '<span class="badge bg-owner">DONO</span>' : '<span class="badge bg-ok">MODERADOR</span>';
  $('admWho').innerHTML = 'Conectado como: <b>' + esc(me.admin.username) + '</b> ' + cargo +
    (me.admin.mustChange ? ' Â· âš  troque a senha padrÃ£o!' : '');
  if (myRole === 'owner') {
    $('modsCard').style.display = 'block';
    $('settingsCard').style.display = 'block';
    $('secCard').style.display = 'block';
    loadMods();
    loadSecurity();
  }
  refreshAll();
}

async function loadSecurity() {
  const r = await api('/api/admin/security');
  if (r._status !== 200) return;
  $('fail24').textContent = r.failedLogins24h;
  $('lock24').textContent = r.lockedEvents24h;
  const tb = $('auditBody');
  tb.innerHTML = '';
  if (!r.events.length) { tb.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Nenhum evento registrado.</td></tr>'; return; }
  const names = {
    login_fail: ['Tentativa invÃ¡lida', 'bg-off'],
    login_locked: ['Conta bloqueada', 'bg-warn'],
    login_ok: ['Login OK', 'bg-ok'],
    key_created: ['KEY criada', 'bg-owner'],
    key_deleted: ['KEY excluÃ­da', 'bg-off'],
    vip_granted: ['VIP liberado', 'bg-ok'],
    vip_removed: ['VIP removido', 'bg-off'],
    mod_created: ['Moderador criado', 'bg-owner'],
    mod_deleted: ['Moderador removido', 'bg-off'],
    password_changed: ['Senha alterada', 'bg-warn'],
    panel_path_changed: ['EndereÃ§o do painel mudou', 'bg-warn']
  };
  r.events.forEach(e => {
    const n = names[e.action] || [e.action, 'bg-warn'];
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="color:var(--muted)">' + new Date(e.at).toLocaleString('pt-BR') + '</td>' +
      '<td><span class="badge ' + n[1] + '">' + n[0] + '</span></td>' +
      '<td>' + esc(e.detail) + '</td>' +
      '<td style="color:var(--muted)">' + esc(e.ip || 'â€”') + '</td>';
    tb.appendChild(tr);
  });
}

function refreshAll(){ loadDashboard(); loadKeys(); loadUsers(); if (myRole==='owner') loadSettings(); }

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.reload(); // volta para a tela de login no mesmo endereÃ§o secreto
});

async function loadDashboard() {
  const r = await api('/api/admin/dashboard');
  if (r._status !== 200) return;
  const items = [
    ['UsuÃ¡rios', r.users], ['UsuÃ¡rios VIP', r.vipUsers],
    ['Keys ativas', r.activeKeys], ['Keys expiradas', r.expiredKeys],
    ['GeraÃ§Ãµes hoje', r.generationsToday]
  ];
  $('statsBox').innerHTML = items.map(([l, v]) => '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>').join('');
}

async function loadKeys() {
  const r = await api('/api/admin/keys');
  const tb = $('keysBody');
  if (r._status !== 200) { tb.innerHTML = ''; return; }
  if (!r.keys.length) { tb.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Nenhuma KEY criada ainda.</td></tr>'; return; }
  tb.innerHTML = '';
  r.keys.forEach(k => {
    const tr = document.createElement('tr');
    const statusBadge = k.status === 'ativa'
      ? (k.expired ? '<span class="badge bg-warn">expirada</span>' : '<span class="badge bg-ok">ativa</span>')
      : '<span class="badge bg-off">inativa</span>';
    const usesTxt = k.maxUses ? (k.uses + '/' + k.maxUses) : (k.uses + '/âˆž');
    tr.innerHTML =
      '<td><span class="code">' + esc(k.code) + '</span></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + usesTxt + '</td>' +
      '<td><input type="date" class="mini-inp exp-inp" value="' + (k.expiresAt ? k.expiresAt.slice(0,10) : '') + '"></td>' +
      '<td>' + esc(k.activatedByLabel || 'â€”') + '</td>' +
      '<td><div class="actions">' +
        '<button class="b-gray cp">Copiar</button>' +
        '<button class="' + (k.status === 'ativa' ? 'b-red tg' : 'b-green tg') + '">' + (k.status === 'ativa' ? 'Desativar' : 'Ativar') + '</button>' +
        '<button class="b-blue sv">Salvar data/usos</button>' +
        '<button class="b-red del">Excluir</button>' +
      '</div></td>';
    tr.querySelector('.cp').onclick = () => navigator.clipboard.writeText(k.code).then(() => alert('KEY copiada!'));
    tr.querySelector('.tg').onclick = async () => {
      await api('/api/admin/keys/' + k.id, { method: 'PATCH', body: { status: k.status === 'ativa' ? 'inativa' : 'ativa' } });
      loadKeys(); loadDashboard();
    };
    tr.querySelector('.sv').onclick = async () => {
      const dateVal = tr.querySelector('.exp-inp').value;
      const usesStr = prompt('Quantidade mÃ¡xima de usos (vazio = ilimitado):', k.maxUses || '');
      const body = {};
      body.expiresAt = dateVal ? dateVal : null;
      if (usesStr !== null) body.maxUses = usesStr === '' ? 0 : parseInt(usesStr, 10);
      const rr = await api('/api/admin/keys/' + k.id, { method: 'PATCH', body });
      if (rr._status === 200) { loadKeys(); loadDashboard(); }
      else alert(rr.message || 'Erro ao salvar.');
    };
    tr.querySelector('.del').onclick = async () => {
      if (!confirm('Excluir a KEY ' + k.code + '?')) return;
      await api('/api/admin/keys/' + k.id, { method: 'DELETE' });
      loadKeys(); loadDashboard();
    };
    tb.appendChild(tr);
  });
}

$('genKeyBtn').addEventListener('click', async () => {
  const btn = $('genKeyBtn'); btn.disabled = true;
  const r = await api('/api/admin/keys', { body: {
    expiresInDays: $('nkDays').value, expiresInHours: $('nkHours').value,
    expiresInMinutes: $('nkMin').value, expiresInSeconds: $('nkSec').value,
    maxUses: $('nkUses').value
  }});
  btn.disabled = false;
  if (r.key) {
    try { await navigator.clipboard.writeText(r.key.code); } catch(_){}
    alert('KEY gerada e copiada:\n\n' + r.key.code);
    loadKeys(); loadDashboard();
  }
});
$('reloadKeysBtn').addEventListener('click', loadKeys);

async function loadUsers() {
  const r = await api('/api/admin/users');
  const tb = $('usersBody');
  if (r._status !== 200) { tb.innerHTML = ''; return; }
  if (!r.users.length) { tb.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Nenhum usuÃ¡rio ainda.</td></tr>'; return; }
  tb.innerHTML = '';
  r.users.forEach(u => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><b>' + esc(u.label) + '</b></td>' +
      '<td>' + (u.isVip ? '<span class="badge bg-ok">VIP</span>' : '<span class="badge bg-off">Free</span>') + '</td>' +
      '<td>' + esc(u.vipSource || 'â€”') + '</td>' +
      '<td style="color:var(--muted)">' + new Date(u.lastSeenAt).toLocaleString('pt-BR') + '</td>' +
      '<td><div class="actions">' +
        (u.isVip
          ? '<button class="b-red rm">Remover VIP</button>'
          : '<button class="b-green gv">Liberar VIP</button>') +
      '</div></td>';
    const b = tr.querySelector('.gv') || tr.querySelector('.rm');
    b.onclick = async () => {
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: { isVip: !u.isVip } });
      loadUsers(); loadDashboard();
    };
    tb.appendChild(tr);
  });
}

/* ---------- moderadores ---------- */

async function loadMods() {
  const r = await api('/api/admin/mods');
  const tb = $('modsBody');
  if (r._status !== 200 || !r.admins) { tb.innerHTML = ''; return; }
  tb.innerHTML = '';
  r.admins.forEach(a => {
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><b>' + esc(a.username) + '</b></td>' +
      '<td>' + (a.role === 'owner' ? '<span class="badge bg-owner">DONO</span>' : '<span class="badge bg-ok">MODERADOR</span>') + '</td>' +
      '<td style="color:var(--muted)">' + new Date(a.createdAt).toLocaleDateString('pt-BR') + '</td>' +
      '<td>' + (a.role === 'owner' ? '' : '<div class="actions"><button class="b-red del">Remover</button></div>') + '</td>';
    const del = tr.querySelector('.del');
    if (del) del.onclick = async () => {
      if (!confirm('Remover o moderador ' + a.username + '?')) return;
      const rr = await api('/api/admin/mods/' + a.id, { method: 'DELETE' });
      if (rr._status !== 200) alert(rr.message || 'Erro.');
      loadMods();
    };
    tb.appendChild(tr);
  });
}

$('addModBtn').addEventListener('click', async () => {
  const btn = $('addModBtn'); btn.disabled = true;
  const r = await api('/api/admin/mods', { body: { username: $('modUser').value.trim(), password: $('modPass').value } });
  btn.disabled = false;
  if (r._status === 200) {
    $('modUser').value = ''; $('modPass').value = '';
    loadMods();
    alert('Moderador criado! Passe o usuÃ¡rio e a senha para ele.\nEle entra pelo mesmo endereÃ§o /admin.');
  } else {
    alert(r.message || 'Erro ao criar moderador.');
  }
});

/* ---------- configuraÃ§Ãµes ---------- */

async function loadSettings() {
  const r = await api('/api/admin/settings');
  if (r._status !== 200) return;
  $('cfgContact').value = r.contactLink || '';
  $('cfgLimit').value = r.freeDailyLimit != null ? r.freeDailyLimit : 3;
  $('cfgPath').value = r.adminPanelPath || '';
}
$('saveCfgBtn').addEventListener('click', async () => {
  const novoCaminho = $('cfgPath').value.trim();
  const r = await api('/api/admin/settings', { method: 'PUT', body: {
    contactLink: $('cfgContact').value, freeDailyLimit: $('cfgLimit').value,
    adminPanelPath: novoCaminho
  }});
  showMsg($('cfgMsg'), r._status === 200 ? 'ConfiguraÃ§Ãµes salvas!' : 'Erro ao salvar.', r._status === 200);
  if (r._status === 200 && r.adminPanelPath && r.adminPanelPath !== location.pathname) {
    alert('EndereÃ§o do painel alterado para:\n' + r.adminPanelPath + '\n\nVocÃª serÃ¡ levado ao novo endereÃ§o (login de novo).');
    location.href = r.adminPanelPath;
  }
});
$('changePwBtn').addEventListener('click', async () => {
  const r = await api('/api/admin/change-password', { body: {
    currentPassword: $('pwOld').value, newPassword: $('pwNew').value
  }});
  showMsg($('cfgMsg'), r._status === 200 ? 'Senha alterada com sucesso!' : (r.message || 'Erro.'), r._status === 200);
  if (r._status === 200) { $('pwOld').value = ''; $('pwNew').value = ''; }
});

boot();

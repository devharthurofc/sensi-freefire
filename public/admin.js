'use strict';

let myRole = 'mod';
const allKeys = [];
const allUsers = [];
const allSales = [];

function $(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || (opts.body ? 'POST' : 'GET'),
    headers: Object.assign({'Content-Type':'application/json'}),
    credentials: 'same-origin',
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch(_){}
  data._status = res.status;
  return data;
}

/* ---------- toast ---------- */
let toastTimer;
function toast(msg, isErr) {
  const t = $('toast');
  $('toastMsg').textContent = msg;
  t.classList.toggle('err', !!isErr);
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

function showMsg(el, text, ok) {
  el.textContent = text;
  el.className = 'msg show ' + (ok ? 'ok' : 'err');
  setTimeout(() => { el.className = 'msg'; }, 3500);
}

/* ---------- navegação ---------- */
document.querySelectorAll('#nav button').forEach(btn => {
  btn.addEventListener('click', () => showSection(btn.dataset.sec));
});
document.querySelectorAll('[data-go]').forEach(btn => {
  btn.addEventListener('click', () => showSection(btn.dataset.go));
});

function showSection(sec) {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('on', b.dataset.sec === sec));
  document.querySelectorAll('.section').forEach(s => s.classList.toggle('on', s.id === 'sec-' + sec));
}

let bootRetries = 0;
async function boot() {
  const me = await api('/api/admin/me');
  if (me._status !== 200) {
    bootRetries++;
    if (bootRetries >= 3) {
      toast('Sessão expirada. Redirecionando para login...', true);
      setTimeout(() => { location.reload(); }, 1500);
    } else {
      setTimeout(() => boot(), 500);
    }
    return;
  }
  bootRetries = 0;
  myRole = me.admin.role || 'mod';
  const cargo = myRole === 'owner' ? '<span class="badge-role bg-owner">DONO</span>' : '<span class="badge-role bg-mod">MODERADOR</span>';
  $('admWho').innerHTML = '<b>' + esc(me.admin.username) + '</b><br>' + cargo +
    (me.admin.mustChange ? '<br><span style="color:#fde047;font-size:.72rem">⚠ troque a senha padrão!</span>' : '');
  if (myRole === 'owner') {
    ['navMods','navCfg','navSec','goCfgQuick'].forEach(id => $(id).style.display = '');
    loadMods();
    loadSecurity();
    loadSettings();
  }
  refreshAll();
  startAutoRefresh();
}

async function safeApi(path, opts) {
  const r = await api(path, opts);
  if (r._status === 401 || r._status === 403) {
    toast('Sessão expirada. Recarregando...', true);
    setTimeout(() => location.reload(), 1500);
    return null;
  }
  return r;
}

function refreshAll(){ loadDashboard(); loadKeys(); loadUsers(); loadSales(); }

let refreshTimer = null;
function startAutoRefresh() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshAll, 30000);
}

$('logoutBtn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  location.reload();
});
$('refreshBtn').addEventListener('click', () => { refreshAll(); toast('Dados atualizados!'); });
$('reloadKeysBtn').addEventListener('click', loadKeys);
$('reloadUsersBtn').addEventListener('click', loadUsers);
$('reloadSalesBtn').addEventListener('click', loadSales);

/* ---------- dashboard ---------- */
async function loadDashboard() {
  const r = await api('/api/admin/dashboard');
  if (r._status === 401 || r._status === 403) return;
  if (r._status !== 200) return;

  const salesStats = await api('/api/admin/sales/stats');
  const revenue = (salesStats && salesStats._status === 200) ? salesStats.totalRevenue : 0;
  const salesCount = (salesStats && salesStats._status === 200) ? salesStats.totalSales : 0;

  const items = [
    ['Online agora', r.onlineCount || 0, true], ['Logados (sessão)', r.loggedNow || 0, true],
    ['Total de usuários', r.users], ['Usuários VIP', r.vipUsers],
    ['Keys ativas', r.activeKeys], ['Gerações hoje', r.generationsToday],
    ['Total de vendas', salesCount], ['Receita total', 'R$ ' + revenue.toFixed(2), false, true]
  ];
  $('statsBox').innerHTML = items.map(([l, v, hot, isRevenue]) =>
    '<div class="stat' + (isRevenue ? ' revenue' : '') + '"><b style="' + (hot && v > 0 ? 'color:#86efac' : '') + '">' + v + '</b><span>' + l + '</span></div>').join('');

  const box = $('onlineList');
  if (!r.onlineList || !r.onlineList.length) {
    box.innerHTML = '<p class="hint" style="margin:0">Nenhum jogador ativo nos últimos 5 minutos.</p>';
    return;
  }
  box.innerHTML = r.onlineList.map(u =>
    '<div style="display:flex;align-items:center;gap:10px;padding:9px 4px;border-bottom:1px solid rgba(255,255,255,.05)">' +
      '<span style="width:9px;height:9px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px #22c55e;flex-shrink:0"></span>' +
      '<b style="font-size:.95rem">' + esc(u.label) + '</b>' +
      (u.isVip
        ? '<span class="badge bg-ok">VIP</span>'
        : '<span class="badge bg-off">Free</span>') +
      '<span style="margin-left:auto;color:var(--muted);font-size:.78rem">visto ' + new Date(u.lastSeenAt).toLocaleTimeString('pt-BR') + '</span>' +
    '</div>').join('');
}

/* ---------- keys ---------- */
document.querySelectorAll('#presets button').forEach(p => {
  p.addEventListener('click', () => {
    $('nkDays').value = p.dataset.d;
    $('nkHours').value = p.dataset.h;
    $('nkMin').value = p.dataset.m;
    $('nkSec').value = p.dataset.s;
    toast('Prazo selecionado: ' + p.textContent.trim());
  });
});

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
    toast('KEY gerada e copiada: ' + r.key.code.slice(0, 12) + '…');
    loadKeys(); loadDashboard();
  } else {
    toast(r.message || 'Erro ao gerar KEY.', true);
  }
});

async function loadKeys() {
  const r = await api('/api/admin/keys');
  allKeys.length = 0;
  if (r._status === 200 && r.keys) allKeys.push(...r.keys);
  renderKeys();
}

function renderKeys() {
  const tb = $('keysBody');
  const q = ($('keySearch').value || '').toLowerCase().trim();
  const list = allKeys.filter(k =>
    !q || k.code.toLowerCase().includes(q) || (k.activatedByLabel || '').toLowerCase().includes(q));

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">' +
      (q ? 'Nenhuma key encontrada para esse filtro.' : 'Nenhuma KEY criada ainda.') + '</td></tr>';
    return;
  }
  tb.innerHTML = '';
  list.forEach(k => {
    const tr = document.createElement('tr');
    const statusBadge = k.status === 'ativa'
      ? (k.expired ? '<span class="badge bg-warn">expirada</span>' : '<span class="badge bg-ok">ativa</span>')
      : '<span class="badge bg-off">inativa</span>';
    const usesTxt = k.maxUses ? (k.uses + '/' + k.maxUses) : (k.uses + '/∞');
    tr.innerHTML =
      '<td><span class="code">' + esc(k.code) + '</span></td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + usesTxt + '</td>' +
      '<td><input type="date" class="mini-inp exp-inp" value="' + (k.expiresAt ? k.expiresAt.slice(0,10) : '') + '"></td>' +
      '<td>' + esc(k.activatedByLabel || '—') + '</td>' +
      '<td><div class="actions">' +
        '<button class="b-gray act cp">Copiar</button>' +
        '<button class="' + (k.status === 'ativa' ? 'b-red act tg' : 'b-green act tg') + '">' + (k.status === 'ativa' ? 'Desativar' : 'Ativar') + '</button>' +
        '<button class="b-gold act sv">Salvar data/usos</button>' +
        '<button class="b-red act del">Excluir</button>' +
      '</div></td>';
    tr.querySelector('.cp').onclick = async () => {
      try { await navigator.clipboard.writeText(k.code); toast('KEY copiada!'); }
      catch(_) { prompt('Copie a KEY:', k.code); }
    };
    tr.querySelector('.tg').onclick = async () => {
      await api('/api/admin/keys/' + k.id, { method: 'PATCH', body: { status: k.status === 'ativa' ? 'inativa' : 'ativa' } });
      toast(k.status === 'ativa' ? 'KEY desativada.' : 'KEY ativada.');
      loadKeys(); loadDashboard();
    };
    tr.querySelector('.sv').onclick = async () => {
      const dateVal = tr.querySelector('.exp-inp').value;
      const usesStr = prompt('Quantidade máxima de usos (vazio = ilimitado):', k.maxUses || '');
      if (usesStr === null) return;
      const body = {};
      body.expiresAt = dateVal ? dateVal : null;
      body.maxUses = usesStr === '' ? 0 : parseInt(usesStr, 10);
      const rr = await api('/api/admin/keys/' + k.id, { method: 'PATCH', body });
      if (rr._status === 200) { toast('KEY atualizada!'); loadKeys(); loadDashboard(); }
      else toast(rr.message || 'Erro ao salvar.', true);
    };
    tr.querySelector('.del').onclick = async () => {
      if (!confirm('Excluir a KEY ' + k.code + '?')) return;
      await api('/api/admin/keys/' + k.id, { method: 'DELETE' });
      toast('KEY excluída.');
      loadKeys(); loadDashboard();
    };
    tb.appendChild(tr);
  });
}
$('keySearch').addEventListener('input', renderKeys);

/* ---------- vendas ---------- */
$('addSaleBtn').addEventListener('click', async () => {
  const key = $('saleKey').value.trim();
  const price = $('salePrice').value;
  const buyer = $('saleBuyer').value.trim();
  const contact = $('saleContact').value.trim();
  const status = $('saleStatus').value;
  const notes = $('saleNotes').value.trim();

  if (!key) { toast('Informe o código da KEY.', true); return; }
  if (!buyer) { toast('Informe o nome do comprador.', true); return; }

  const btn = $('addSaleBtn'); btn.disabled = true;
  const r = await api('/api/admin/sales', { body: {
    keyCode: key, price: parseFloat(price) || 0, buyerLabel: buyer,
    buyerContact: contact, status, notes
  }});
  btn.disabled = false;

  if (r._status === 200) {
    toast('Venda registrada! R$ ' + (parseFloat(price) || 0).toFixed(2));
    $('saleKey').value = ''; $('salePrice').value = ''; $('saleBuyer').value = '';
    $('saleContact').value = ''; $('saleNotes').value = '';
    loadSales(); loadDashboard();
  } else {
    toast(r.message || 'Erro ao registrar venda.', true);
  }
});

async function loadSales() {
  const r = await api('/api/admin/sales');
  allSales.length = 0;
  if (r._status === 200 && r.sales) allSales.push(...r.sales);

  if (r._status === 200 && r.stats) {
    const s = r.stats;
    $('salesStatsBox').innerHTML =
      '<div class="stat"><b>' + s.totalSales + '</b><span>Total de vendas</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.totalRevenue.toFixed(2) + '</b><span>Receita total</span></div>' +
      '<div class="stat"><b>' + s.salesToday + '</b><span>Vendas hoje</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.revenueToday.toFixed(2) + '</b><span>Receita hoje</span></div>';
  }

  renderSales();
}

function renderSales() {
  const tb = $('salesBody');
  const q = ($('saleSearch').value || '').toLowerCase().trim();
  const list = allSales.filter(s =>
    !q || s.keyCode.toLowerCase().includes(q) || (s.buyerLabel || '').toLowerCase().includes(q));

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">' +
      (q ? 'Nenhuma venda encontrada.' : 'Nenhuma venda registrada ainda.') + '</td></tr>';
    return;
  }
  tb.innerHTML = '';
  list.forEach(s => {
    const tr = document.createElement('tr');
    const statusBadge = s.status === 'pago'
      ? '<span class="badge bg-ok">pago</span>'
      : '<span class="badge bg-warn">pendente</span>';
    const date = s.soldAt ? new Date(s.soldAt).toLocaleString('pt-BR') : '—';
    tr.innerHTML =
      '<td><span class="code">' + esc(s.keyCode) + '</span></td>' +
      '<td><b>' + esc(s.buyerLabel) + '</b></td>' +
      '<td style="color:#86efac;font-weight:700">R$ ' + (s.price || 0).toFixed(2) + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="color:var(--muted)">' + esc(s.sellerAdminName || '—') + '</td>' +
      '<td style="color:var(--muted)">' + date + '</td>' +
      '<td><div class="actions">' +
        '<button class="b-gray act cp">Copiar KEY</button>' +
        (s.status === 'pendente' ? '<button class="b-green act pg">Marcar pago</button>' : '') +
        '<button class="b-red act del">Excluir</button>' +
      '</div></td>';
    tr.querySelector('.cp').onclick = async () => {
      try { await navigator.clipboard.writeText(s.keyCode); toast('KEY copiada!'); }
      catch(_) { prompt('Copie a KEY:', s.keyCode); }
    };
    const pgBtn = tr.querySelector('.pg');
    if (pgBtn) pgBtn.onclick = async () => {
      await api('/api/admin/sales/' + s.id, { method: 'PATCH', body: { status: 'pago' } });
      toast('Venda marcada como paga!');
      loadSales(); loadDashboard();
    };
    tr.querySelector('.del').onclick = async () => {
      if (!confirm('Excluir registro de venda?')) return;
      await api('/api/admin/sales/' + s.id, { method: 'DELETE' });
      toast('Venda excluída.');
      loadSales(); loadDashboard();
    };
    tb.appendChild(tr);
  });
}
$('saleSearch').addEventListener('input', renderSales);

/* ---------- usuários ---------- */
async function loadUsers() {
  const r = await api('/api/admin/users');
  allUsers.length = 0;
  if (r._status === 200 && r.users) allUsers.push(...r.users);
  renderUsers();
}

function renderUsers() {
  const tb = $('usersBody');
  const q = ($('userSearch').value || '').toLowerCase().trim();
  const filtro = $('userFilter').value;

  let list = allUsers.filter(u => !q || (u.label || '').toLowerCase().includes(q));
  if (filtro === 'online') list = list.filter(u => u.online);
  else if (filtro === 'logado') list = list.filter(u => u.logado);
  else if (filtro === 'vip') list = list.filter(u => u.isVip);
  else if (filtro === 'free') list = list.filter(u => !u.isVip);

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Nenhum jogador encontrado para esse filtro.</td></tr>';
    return;
  }
  tb.innerHTML = '';
  list.forEach(u => {
    const seen = u.lastSeenAt ? new Date(u.lastSeenAt).toLocaleString('pt-BR') : '—';
    const situacao = u.online
      ? '<span class="badge bg-ok">🟢 online</span>' + (u.logado ? ' <span style="color:var(--muted);font-size:.72rem">' + u.sessoes + ' sessão(ões)</span>' : '')
      : (u.logado
        ? '<span class="badge bg-warn">sessão aberta</span>'
        : '<span style="color:var(--muted);font-size:.78rem">offline</span>');

    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td><b>' + esc(u.label || '(sem nome)') + '</b></td>' +
      '<td>' + situacao + '</td>' +
      '<td>' + (u.isVip
        ? '<span class="badge bg-ok">VIP · ' + esc(u.vipSource || '') + '</span>'
        : '<span class="badge bg-off">Free</span>') + '</td>' +
      '<td style="color:var(--muted)">' + esc(u.vipSource || '—') + '</td>' +
      '<td style="color:var(--muted)">' + seen + '</td>' +
      '<td><div class="actions">' +
        (u.isVip
          ? '<button class="b-red act rm">Remover VIP</button>'
          : '<button class="b-green act gv">Liberar VIP</button>') +
      '</div></td>';
    const b = tr.querySelector('.gv') || tr.querySelector('.rm');
    b.onclick = async () => {
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: { isVip: !u.isVip } });
      toast(u.isVip ? ('VIP removido de ' + u.label + '.') : ('VIP liberado para ' + u.label + '!'));
      loadUsers(); loadDashboard();
    };
    tb.appendChild(tr);
  });
}
$('userSearch').addEventListener('input', renderUsers);
$('userFilter').addEventListener('change', renderUsers);

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
      '<td>' + (a.role === 'owner' ? '<span class="badge bg-owner" style="background:rgba(56,189,248,.14);color:#7dd3fc;border:1px solid rgba(56,189,248,.45)">DONO</span>' : '<span class="badge bg-ok">MODERADOR</span>') + '</td>' +
      '<td style="color:var(--muted)">' + new Date(a.createdAt).toLocaleDateString('pt-BR') + '</td>' +
      '<td>' + (a.role === 'owner' ? '' : '<div class="actions"><button class="b-red act del">Remover</button></div>') + '</td>';
    const del = tr.querySelector('.del');
    if (del) del.onclick = async () => {
      if (!confirm('Remover o moderador ' + a.username + '?')) return;
      const rr = await api('/api/admin/mods/' + a.id, { method: 'DELETE' });
      if (rr._status !== 200) toast(rr.message || 'Erro.', true);
      else toast('Moderador removido.');
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
    toast('Moderador criado! Passe o usuário e a senha para ele.');
  } else {
    toast(r.message || 'Erro ao criar moderador.', true);
  }
});

/* ---------- configurações ---------- */

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
  showMsg($('cfgMsg'), r._status === 200 ? 'Configurações salvas!' : 'Erro ao salvar.', r._status === 200);
  if (r._status === 200 && r.adminPanelPath && r.adminPanelPath !== location.pathname) {
    alert('Endereço do painel alterado para:\n' + r.adminPanelPath + '\n\nVocê será levado ao novo endereço (login de novo).');
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

/* ---------- segurança ---------- */

async function loadSecurity() {
  const r = await api('/api/admin/security');
  if (r._status !== 200) return;
  $('fail24').textContent = r.failedLogins24h;
  $('lock24').textContent = r.lockedEvents24h;
  const tb = $('auditBody');
  tb.innerHTML = '';
  if (!r.events.length) { tb.innerHTML = '<tr><td colspan="4" style="color:var(--muted)">Nenhum evento registrado.</td></tr>'; return; }
  const names = {
    login_fail: ['Tentativa inválida', 'bg-off'],
    login_locked: ['Conta bloqueada', 'bg-warn'],
    login_ok: ['Login OK', 'bg-ok'],
    key_created: ['KEY criada', 'bg-owner'],
    key_deleted: ['KEY excluída', 'bg-off'],
    vip_granted: ['VIP liberado', 'bg-ok'],
    vip_removed: ['VIP removido', 'bg-off'],
    mod_created: ['Moderador criado', 'bg-owner'],
    mod_deleted: ['Moderador removido', 'bg-off'],
    password_changed: ['Senha alterada', 'bg-warn'],
    panel_path_changed: ['Endereço do painel mudou', 'bg-warn'],
    sale_created: ['Venda registrada', 'bg-purple'],
    sale_deleted: ['Venda excluída', 'bg-off']
  };
  const badgeOwner = 'background:rgba(56,189,248,.14);color:#7dd3fc;border:1px solid rgba(56,189,248,.45)';
  r.events.forEach(e => {
    const n = names[e.action] || [e.action, 'bg-warn'];
    const extraStyle = n[1] === 'bg-owner' ? ' style="' + badgeOwner + '"' : '';
    const tr = document.createElement('tr');
    tr.innerHTML =
      '<td style="color:var(--muted)">' + new Date(e.at).toLocaleString('pt-BR') + '</td>' +
      '<td><span class="badge ' + n[1] + '"' + extraStyle + '>' + n[0] + '</span></td>' +
      '<td>' + esc(e.detail) + '</td>' +
      '<td style="color:var(--muted)">' + esc(e.ip || '—') + '</td>';
    tb.appendChild(tr);
  });
}

boot();

'use strict';

let myRole = 'mod';
const allKeys = [];
const allUsers = [];
const allSales = [];
let currentPrices = { premium: {}, vip: {} };

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
  if (sec === 'reports') loadReports();
  if (sec === 'activity') loadActivity();
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
  loadAnnouncement();
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

function refreshAll(){ loadDashboard(); loadKeys(); loadUsers(); loadSales(); loadNotifications(); loadPrices(); }

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
    maxUses: $('nkUses').value,
    type: $('nkType').value
  }});
  btn.disabled = false;
  if (r.key) {
    try { await navigator.clipboard.writeText(r.key.code); } catch(_){}
    toast('KEY gerada e copiada: ' + r.key.code);
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
    !q || k.code.toLowerCase().includes(q) || (k.activatedByLabel || '').toLowerCase().includes(q) ||
    (k.type || '').toLowerCase().includes(q));

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="7" style="color:var(--muted)">' +
      (q ? 'Nenhuma key encontrada para esse filtro.' : 'Nenhuma KEY criada ainda.') + '</td></tr>';
    return;
  }
  tb.innerHTML = '';
  list.forEach(k => {
    const tr = document.createElement('tr');
    // Status visual: aguardando (dourado), ativa (verde), expirada (amarelo), inativa (cinza)
    let statusBadge;
    if (k.status === 'aguardando') {
      statusBadge = '<span class="badge" style="background:rgba(245,158,11,.18);color:#fbbf24;border:1px solid rgba(245,158,11,.4)">⏳ aguardando</span>';
    } else if (k.status === 'ativa') {
      statusBadge = k.expired
        ? '<span class="badge bg-warn">expirada</span>'
        : '<span class="badge bg-ok">ativa</span>';
    } else if (k.status === 'usada' || k.status === 'utilizada') {
      statusBadge = '<span class="badge" style="background:rgba(59,130,246,.18);color:#60a5fa;border:1px solid rgba(59,130,246,.4)">✓ usada</span>';
    } else {
      statusBadge = '<span class="badge bg-off">' + (k.status || 'inativa') + '</span>';
    }
    const typeBadge = (k.type === 'proibida' || k.type === 'vip')
      ? '<span class="badge bg-warn" style="font-size:.7rem">🔴 PROIBIDA</span>'
      : '<span class="badge bg-owner" style="font-size:.7rem">🟦 PREMIUM</span>';
    const usesTxt = k.maxUses ? (k.uses + '/' + k.maxUses) : (k.uses + '/∞');
    tr.innerHTML =
      '<td><span class="code">' + esc(k.code) + '</span></td>' +
      '<td>' + typeBadge + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td>' + usesTxt + '</td>' +
      // coluna validade: mostra a data se já foi ativada, ou a duração se está aguardando
      '<td>' + (
        k.status === 'aguardando'
          ? '<span style="color:#fbbf24;font-size:.82rem">⏱️ ' + esc(k.duration || k.plan || '—') + ' <span style="color:var(--muted);font-size:.7rem">(após ativar)</span></span>'
          : '<input type="date" class="mini-inp exp-inp" value="' + (k.expiresAt ? k.expiresAt.slice(0,10) : '') + '">'
      ) + '</td>' +
      '<td>' + esc(k.activatedByLabel || '—') + '</td>' +
      '<td><div class="actions">' +
        '<button class="b-gray act cp">Copiar</button>' +
        '<button class="' + (k.status === 'ativa' ? 'b-red act tg' : 'b-green act tg') + '">' + (k.status === 'ativa' ? 'Desativar' : 'Ativar') + '</button>' +
        '<button class="b-gold act sv">Salvar data/usos</button>' +
        '<button class="b-green act ren">Renovar (+horas/min)</button>' +
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
    tr.querySelector('.ren').onclick = async () => {
      const dStr = prompt('Dias a adicionar (ex: 7):', '0');
      const hStr = prompt('Horas a adicionar (ex: 12):', '0');
      const mStr = prompt('Minutos a adicionar (ex: 30):', '0');
      if (dStr === null && hStr === null && mStr === null) return;
      const days = parseInt(dStr || '0', 10);
      const hours = parseInt(hStr || '0', 10);
      const minutes = parseInt(mStr || '0', 10);
      if (isNaN(days) || isNaN(hours) || isNaN(minutes)) { toast('Valores inválidos.', true); return; }
      const current = k.expiresAt ? new Date(k.expiresAt) : new Date();
      current.setUTCDate(current.getUTCDate() + days);
      current.setUTCHours(current.getUTCHours() + hours);
      current.setUTCMinutes(current.getUTCMinutes() + minutes);
      const newExpires = current.toISOString();
      const rr = await api('/api/admin/keys/' + k.id, { method: 'PATCH', body: { expiresAt: newExpires } });
      if (rr._status === 200) { toast('KEY renovada! Nova expiração: ' + newExpires.slice(0,19).replace('T',' ')); loadKeys(); loadDashboard(); }
      else toast(rr.message || 'Erro ao renovar.', true);
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

function buildChart(days) {
  const maxCount = Math.max(...days.map(d => d.count), 1);
  const maxRevenue = Math.max(...days.map(d => d.revenue), 1);

  let barsHtml = days.map(d => {
    const hCount = Math.round((d.count / maxCount) * 100);
    const hRevenue = Math.round((d.revenue / maxRevenue) * 100);
    return '<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">' +
      '<div style="width:100%;height:80px;display:flex;align-items:flex-end;justify-content:center;gap:3px">' +
        '<div style="width:12px;height:' + hCount + '%;background:var(--red2);border-radius:4px 4px 0 0;transition:height .3s" title="' + d.count + ' vendas"></div>' +
        '<div style="width:12px;height:' + hRevenue + '%;background:#22c55e;border-radius:4px 4px 0 0;transition:height .3s" title="R$ ' + d.revenue.toFixed(2) + '"></div>' +
      '</div>' +
      '<span style="font-size:.6rem;color:var(--muted);text-transform:uppercase">' + d.label + '</span>' +
      '<span style="font-size:.65rem;font-weight:700">' + d.count + '</span>' +
    '</div>';
  }).join('');

  return '<h3 class="sec">📊 Últimos 7 dias</h3>' +
    '<div style="display:flex;gap:8px;align-items:flex-end">' + barsHtml + '</div>' +
    '<div style="display:flex;gap:16px;margin-top:10px;justify-content:center">' +
      '<span style="font-size:.65rem;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;background:var(--red2);border-radius:2px;margin-right:4px"></span>Vendas</span>' +
      '<span style="font-size:.65rem;color:var(--muted)"><span style="display:inline-block;width:10px;height:10px;background:#22c55e;border-radius:2px;margin-right:4px"></span>Receita</span>' +
    '</div>';
}

/* ---------- auto-preço ao mudar plano/duração ---------- */

function getPlanPrice(planType, duration) {
  const dict = currentPrices[planType] || {};
  return dict[duration] || 0;
}

function updateSalePrice() {
  const planType = $('salePlanType').value;
  const duration = $('salePlanDuration').value;
  const price = getPlanPrice(planType, duration);
  $('salePrice').value = price > 0 ? price.toFixed(2) : '';
  $('salePriceHint').textContent = price > 0 ? 'Preço do plano: R$ ' + price.toFixed(2) : 'Defina o preço manualmente';
}

if ($('salePlanType')) $('salePlanType').addEventListener('change', updateSalePrice);
if ($('salePlanDuration')) $('salePlanDuration').addEventListener('change', updateSalePrice);

/* ---------- validação de WhatsApp ---------- */

function normalizeWhatsApp(val) {
  let s = (val || '').replace(/\D/g, '');
  if (s.startsWith('55') && s.length > 12) s = s.slice(2);
  if (s.length === 11 && s[2] === '9') return '+55' + s;
  if (s.length === 10) return '+55' + s.slice(0,2) + '9' + s.slice(2);
  return s.length >= 10 ? '+55' + s : s;
}

function formatWhatsApp(val) {
  const raw = (val || '').replace(/\D/g, '');
  if (raw.length < 10) return val;
  const ddd = raw.slice(0,2);
  const num = raw.slice(2);
  if (num.length === 9) return '+55 (' + ddd + ') ' + num.slice(0,5) + '-' + num.slice(5);
  if (num.length === 8) return '+55 (' + ddd + ') ' + num.slice(0,4) + '-' + num.slice(4);
  return '+55 ' + raw;
}

if ($('saleContact')) {
  $('saleContact').addEventListener('blur', function() {
    this.value = formatWhatsApp(this.value);
  });
}

/* ---------- registrar venda ---------- */

$('addSaleBtn').addEventListener('click', async () => {
  const key = $('saleKey').value.trim();
  const price = $('salePrice').value;
  const buyer = $('saleBuyer').value.trim();
  const contact = $('saleContact').value.trim();
  const email = $('saleEmail') ? $('saleEmail').value.trim() : '';
  const paymentMethod = $('salePayment').value;
  const status = $('saleStatus').value;
  const notes = $('saleNotes').value.trim();
  const planType = $('salePlanType').value;
  const planDuration = $('salePlanDuration').value;

  if (!buyer) { toast('Informe o nome do cliente.', true); return; }
  if (!contact) { toast('Informe o WhatsApp do cliente.', true); return; }

  const whatsapp = normalizeWhatsApp(contact);
  if (whatsapp.replace(/\D/g, '').length < 12) { toast('WhatsApp inválido. Use: +55 (DDD) 9XXXX-XXXX', true); return; }

  const finalPrice = parseFloat(price) || getPlanPrice(planType, planDuration) || 0;

  const btn = $('addSaleBtn'); btn.disabled = true;
  const r = await api('/api/admin/sales', { body: {
    keyCode: key, price: finalPrice, buyerLabel: buyer,
    buyerContact: whatsapp, buyerEmail: email, paymentMethod, status, notes,
    product: 'Aimzy', plan: planType + ' · ' + planDuration, planType: planType
  }});
  btn.disabled = false;

  if (r._status === 200) {
    toast('Venda registrada com sucesso!');
    $('saleKey').value = ''; $('salePrice').value = ''; $('saleBuyer').value = '';
    $('saleContact').value = ''; $('saleNotes').value = '';
    if ($('saleEmail')) $('saleEmail').value = '';
    $('salePriceHint').textContent = '';
    if (r.sale) showReceipt(r.sale);
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
    const chartHtml = s.last7Days ? buildChart(s.last7Days) : '';
    $('salesStatsBox').innerHTML =
      '<div class="stat"><b>' + s.totalSales + '</b><span>Total de vendas</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.totalRevenue.toFixed(2) + '</b><span>Receita total</span></div>' +
      '<div class="stat"><b>' + s.salesToday + '</b><span>Vendas hoje</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.revenueToday.toFixed(2) + '</b><span>Receita hoje</span></div>' +
      '<div class="stat"><b>' + s.salesYesterday + '</b><span>Vendas ontem</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.revenueYesterday.toFixed(2) + '</b><span>Receita ontem</span></div>' +
      '<div class="stat"><b>' + s.salesWeek + '</b><span>Vendas esta semana</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.revenueWeek.toFixed(2) + '</b><span>Receita semana</span></div>' +
      '<div class="stat"><b>' + s.salesMonth + '</b><span>Vendas este mês</span></div>' +
      '<div class="stat revenue"><b>R$ ' + s.revenueMonth.toFixed(2) + '</b><span>Receita mês</span></div>' +
      chartHtml;
  }

  renderSales();
}

function renderSales() {
  const tb = $('salesBody');
  const q = ($('saleSearch').value || '').toLowerCase().trim();
  const filterPlan = $('saleFilterPlan') ? $('saleFilterPlan').value : '';
  const filterStatus = $('saleFilterStatus') ? $('saleFilterStatus').value : '';
  const filterPayment = $('saleFilterPayment') ? $('saleFilterPayment').value : '';

  let list = allSales.filter(s => {
    if (q && !(s.keyCode || '').toLowerCase().includes(q) && !(s.buyerLabel || '').toLowerCase().includes(q) && !(s.buyerContact || '').toLowerCase().includes(q) && !(s.id || '').toLowerCase().includes(q)) return false;
    if (filterPlan && s.planType !== filterPlan) return false;
    if (filterStatus && s.status !== filterStatus) return false;
    if (filterPayment && s.paymentMethod !== filterPayment) return false;
    return true;
  });

  if (!list.length) {
    tb.innerHTML = '<tr><td colspan="9" style="color:var(--muted)">' +
      (q || filterPlan || filterStatus || filterPayment ? 'Nenhuma venda encontrada para esse filtro.' : 'Nenhuma venda registrada ainda.') + '</td></tr>';
    return;
  }
  tb.innerHTML = '';
  list.forEach(s => {
    const tr = document.createElement('tr');
    const statusBadge = s.status === 'pago'
      ? '<span class="badge bg-ok">pago</span>'
      : '<span class="badge bg-warn">pendente</span>';
    const date = s.soldAt ? new Date(s.soldAt).toLocaleString('pt-BR') : '—';
    const paymentLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro' };
    const planLabels = { premium: '🟦 Premium', proibida: '🔴 VIP' };
    const planName = s.plan || '—';
    const emailBadge = s.emailSent && s.emailSent.purchase ? ' <span style="font-size:.65rem;color:#86efac">📧</span>' : '';
    tr.innerHTML =
      '<td style="font-size:.82rem"><b>' + esc(planLabels[s.planType] || s.planType || '—') + '</b><br><span style="color:var(--muted);font-size:.75rem">' + esc(planName) + emailBadge + '</span></td>' +
      '<td><b>' + esc(s.buyerLabel) + '</b></td>' +
      '<td style="font-size:.82rem;color:var(--muted)">' + esc(s.buyerContact || '—') + '</td>' +
      '<td><span class="code">' + esc(s.keyCode || '—') + '</span></td>' +
      '<td style="color:#86efac;font-weight:700">R$ ' + (s.price || 0).toFixed(2) + '</td>' +
      '<td style="color:var(--muted);font-size:.82rem">' + esc(paymentLabels[s.paymentMethod] || s.paymentMethod || '—') + '</td>' +
      '<td>' + statusBadge + '</td>' +
      '<td style="color:var(--muted);font-size:.82rem">' + date + '</td>' +
      '<td><div class="actions">' +
        (s.keyCode ? '<button class="b-gray act cp">Copiar KEY</button>' : '') +
        '<button class="b-gray act wpp">WhatsApp</button>' +
        '<button class="b-gray act email-btn" title="Enviar comprovante por e-mail">📧</button>' +
        (s.status === 'pendente' ? '<button class="b-green act pg">Pagar</button>' : '') +
        '<button class="b-red act del">🗑️</button>' +
      '</div></td>';
    const cpBtn = tr.querySelector('.cp');
    if (cpBtn) cpBtn.onclick = async () => {
      try { await navigator.clipboard.writeText(s.keyCode); toast('KEY copiada!'); }
      catch(_) { prompt('Copie a KEY:', s.keyCode); }
    };
    tr.querySelector('.wpp').onclick = () => sendWhatsAppReceipt(s);
    tr.querySelector('.email-btn').onclick = () => sendSaleEmail(s);
    const pgBtn = tr.querySelector('.pg');
    if (pgBtn) pgBtn.onclick = async () => {
      await api('/api/admin/sales/' + s.id, { method: 'PATCH', body: { status: 'pago' } });
      s.status = 'pago';
      toast('Venda marcada como paga!');
      if (s.buyerEmail && s.keyCode) {
        if (confirm('Deseja enviar o e-mail de aprovação com a KEY para ' + s.buyerEmail + '?')) {
          const er = await api('/api/admin/email/send-approval', { body: { saleId: s.id } });
          if (er._status === 200) toast('E-mail de aprovação enviado!');
          else toast(er.message || 'Erro ao enviar e-mail.', true);
        }
      }
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
if ($('saleFilterPlan')) $('saleFilterPlan').addEventListener('change', renderSales);
if ($('saleFilterStatus')) $('saleFilterStatus').addEventListener('change', renderSales);
if ($('saleFilterPayment')) $('saleFilterPayment').addEventListener('change', renderSales);

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
        '<button class="b-red act del" title="Remover usuário">🗑️</button>' +
      '</div></td>';
    const b = tr.querySelector('.gv') || tr.querySelector('.rm');
    b.onclick = async () => {
      await api('/api/admin/users/' + u.id, { method: 'PATCH', body: { isVip: !u.isVip } });
      toast(u.isVip ? ('VIP removido de ' + u.label + '.') : ('VIP liberado para ' + u.label + '!'));
      loadUsers(); loadDashboard();
    };
    tr.querySelector('.del').onclick = async () => {
      if (!confirm('Remover o usuário "' + (u.label || '(sem nome)') + '"?\nEle poderá criar uma nova conta ao acessar o site.')) return;
      await api('/api/admin/users/' + u.id, { method: 'DELETE' });
      toast('Usuário removido.');
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
}
$('saveCfgBtn').addEventListener('click', async () => {
  const r = await api('/api/admin/settings', { method: 'PUT', body: {
    contactLink: $('cfgContact').value, freeDailyLimit: $('cfgLimit').value
  }});
  showMsg($('cfgMsg'), r._status === 200 ? 'Configurações salvas!' : 'Erro ao salvar.', r._status === 200);
});
$('changePwBtn').addEventListener('click', async () => {
  const r = await api('/api/admin/change-password', { body: {
    currentPassword: $('pwOld').value, newPassword: $('pwNew').value
  }});
  showMsg($('cfgMsg'), r._status === 200 ? 'Senha alterada com sucesso!' : (r.message || 'Erro.'), r._status === 200);
  if (r._status === 200) { $('pwOld').value = ''; $('pwNew').value = ''; }
});

$('saveAnnBtn').addEventListener('click', async () => {
  const title = $('annTitle').value.trim();
  const message = $('annMsg').value.trim();
  if (!message) { toast('Escreva uma mensagem.', true); return; }
  const r = await api('/api/admin/announcement', { body: { title, message, active: true } });
  if (r._status === 200) { toast('Aviso publicado!'); $('annTitle').value = ''; $('annMsg').value = ''; }
  else toast('Erro ao salvar aviso.', true);
});

$('clearAnnBtn').addEventListener('click', async () => {
  const r = await api('/api/admin/announcement', { body: { active: false } });
  if (r._status === 200) toast('Aviso removido.');
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

/* ---------- relatórios ---------- */

async function loadReports() {
  const salesR = await api('/api/admin/sales');
  const statsR = await api('/api/admin/sales/stats');
  if (statsR._status !== 200) return;

  const s = statsR;
  $('reportStats').innerHTML =
    '<div class="stat"><b>' + s.salesToday + '</b><span>Vendas hoje</span></div>' +
    '<div class="stat revenue"><b>R$ ' + s.revenueToday.toFixed(2) + '</b><span>Receita hoje</span></div>' +
    '<div class="stat"><b>' + s.salesWeek + '</b><span>Vendas semana</span></div>' +
    '<div class="stat revenue"><b>R$ ' + s.revenueWeek.toFixed(2) + '</b><span>Receita semana</span></div>' +
    '<div class="stat"><b>' + s.salesMonth + '</b><span>Vendas mês</span></div>' +
    '<div class="stat revenue"><b>R$ ' + s.revenueMonth.toFixed(2) + '</b><span>Receita mês</span></div>' +
    '<div class="stat"><b>' + s.totalSales + '</b><span>Total vendas</span></div>' +
    '<div class="stat revenue"><b>R$ ' + s.totalRevenue.toFixed(2) + '</b><span>Receita total</span></div>';

  if (s.last7Days) {
    $('reportChart').innerHTML = buildChart(s.last7Days);
  }

  const sales = (salesR._status === 200 && salesR.sales) ? salesR.sales : [];
  const paymentCount = {};
  const dayCount = {};
  sales.forEach(s => {
    if (s.paymentMethod) paymentCount[s.paymentMethod] = (paymentCount[s.paymentMethod] || 0) + 1;
    if (s.soldAt) {
      const d = s.soldAt.slice(0, 10);
      dayCount[d] = (dayCount[d] || 0) + 1;
    }
  });

  const topPayments = Object.entries(paymentCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topDays = Object.entries(dayCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const avgTicket = s.totalSales > 0 ? (s.totalRevenue / s.totalSales) : 0;

  $('reportTop').innerHTML =
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px">' +
    '<div class="card" style="padding:16px"><h4 style="margin-bottom:10px;color:var(--muted)">💰 Ticket Médio</h4>' +
    '<div style="font-size:1.5rem;font-weight:700;color:#86efac">R$ ' + avgTicket.toFixed(2) + '</div>' +
    '<p style="color:var(--muted);font-size:.8rem;margin-top:4px">Média por venda</p></div>' +
    '<div class="card" style="padding:16px"><h4 style="margin-bottom:10px;color:var(--muted)">📅 Dias com mais vendas</h4>' +
    (topDays.length ? topDays.map(([k, v]) => '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted)">' + new Date(k + 'T12:00:00').toLocaleDateString('pt-BR') + '</span><b>' + v + ' vendas</b></div>').join('') : '<p style="color:var(--muted)">Sem dados</p>') + '</div>' +
    '<div class="card" style="padding:16px"><h4 style="margin-bottom:10px;color:var(--muted)">💳 Formas de pagamento</h4>' +
    (topPayments.length ? topPayments.map(([k, v]) => '<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)"><span style="color:var(--muted)">' + esc(k) + '</span><b>' + v + ' vendas</b></div>').join('') : '<p style="color:var(--muted)">Sem dados</p>') + '</div>' +
    '</div>';
}

/* ---------- atividades ---------- */

async function loadActivity() {
  const r = await api('/api/admin/audit');
  const el = $('auditList');
  if (r._status !== 200 || !r.events || !r.events.length) {
    el.innerHTML = '<p style="color:var(--muted)">Nenhuma atividade registrada.</p>';
    return;
  }
  const names = {
    sale_created: ['Venda registrada', 'bg-purple'],
    sale_deleted: ['Venda excluída', 'bg-off'],
    key_created: ['KEY criada', 'bg-owner'],
    key_deleted: ['KEY excluída', 'bg-off'],
    vip_granted: ['VIP liberado', 'bg-ok'],
    password_changed: ['Senha alterada', 'bg-warn']
  };
  el.innerHTML = r.events.map(e => {
    const n = names[e.action] || [e.action, 'bg-warn'];
    return '<div style="display:flex;gap:12px;padding:10px 0;border-bottom:1px solid var(--border);align-items:center">' +
      '<span class="badge ' + n[1] + '">' + n[0] + '</span>' +
      '<span style="flex:1">' + esc(e.detail) + '</span>' +
      '<span style="color:var(--muted);font-size:.8rem">' + new Date(e.at).toLocaleString('pt-BR') + '</span>' +
    '</div>';
  }).join('');
}

$('reloadAuditBtn').addEventListener('click', loadActivity);

/* ---------- notificações ---------- */

async function loadNotifications() {
  const r = await api('/api/admin/notifications');
  const el = $('notifList');
  const countEl = $('notifCount');

  if (r._status !== 200 || !r.notifications || !r.notifications.length) {
    el.innerHTML = '<p style="color:var(--muted)">Nenhuma notificação no momento.</p>';
    if (countEl) countEl.style.display = 'none';
    return;
  }

  if (countEl) {
    countEl.textContent = r.notifications.length;
    countEl.style.display = '';
  }

  el.innerHTML = r.notifications.map(n => {
    const colors = { warning: '#fde047', info: '#7dd3fc', success: '#86efac' };
    const icons = { warning: '⚠️', info: 'ℹ️', success: '✅' };
    return '<div style="display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);align-items:center">' +
      '<span style="font-size:1.2rem">' + (icons[n.type] || 'ℹ️') + '</span>' +
      '<span style="flex:1;color:' + (colors[n.type] || 'var(--text)') + '">' + esc(n.msg) + '</span>' +
      '<span style="color:var(--muted);font-size:.75rem">' + new Date(n.at).toLocaleString('pt-BR') + '</span>' +
    '</div>';
  }).join('');
}

$('reloadNotifBtn').addEventListener('click', loadNotifications);

$('notifBell').addEventListener('click', () => showSection('notifications'));

/* ---------- comprovante de venda ---------- */

let lastReceiptData = null;

function showReceipt(sale) {
  lastReceiptData = sale;
  const d = new Date(sale.soldAt);
  const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const paymentLabels = { pix: 'Pix', dinheiro: 'Dinheiro', cartao: 'Cartão', outro: 'Outro' };
  const payment = paymentLabels[sale.paymentMethod] || sale.paymentMethod || '—';
  const statusBadge = sale.status === 'pago'
    ? '<span style="background:#22c55e;color:#fff;padding:3px 10px;border-radius:20px;font-size:.8rem;font-weight:700">PAGO</span>'
    : '<span style="background:#f59e0b;color:#000;padding:3px 10px;border-radius:20px;font-size:.8rem;font-weight:700">PENDENTE</span>';
  const emailSentBadge = sale.emailSent && sale.emailSent.purchase
    ? '<span style="background:rgba(34,197,94,.2);color:#86efac;padding:3px 10px;border-radius:20px;font-size:.75rem;font-weight:700;margin-left:6px">📧 E-mail enviado</span>'
    : '';

  $('receiptBody').innerHTML =
    '<div style="text-align:center;border-bottom:2px dashed var(--border);padding-bottom:14px;margin-bottom:14px">' +
      '<div style="font-size:1.3rem;font-weight:900;letter-spacing:.04em;color:var(--red3)">AIMZY</div>' +
      '<div style="font-size:.85rem;color:var(--muted);font-weight:600">COMPROVANTE DE COMPRA</div>' +
    '</div>' +
    '<div style="display:flex;flex-direction:column;gap:10px;border-bottom:1px dashed var(--border);padding-bottom:14px;margin-bottom:14px">' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Cliente</span><b>' + esc(sale.buyerLabel || '—') + '</b></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">WhatsApp</span><b>' + esc(sale.buyerContact || '—') + '</b></div>' +
      (sale.buyerEmail ? '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">E-mail</span><b style="font-size:.85rem">' + esc(sale.buyerEmail) + '</b></div>' : '') +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Plano</span><b>' + esc(sale.plan || '—') + '</b></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Duração</span><b>' + esc((sale.planDuration || sale.plan || '—')) + '</b></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Valor</span><b style="color:#86efac">R$ ' + (sale.price || 0).toFixed(2) + '</b></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Pagamento</span><b>' + payment + '</b></div>' +
      (sale.keyCode ? '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Key</span><b style="color:var(--red3);font-size:.95rem">' + esc(sale.keyCode) + '</b></div>' : '') +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">Data</span><b>' + dateStr + '</b></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="color:var(--muted)">ID da venda</span><b style="font-size:.82rem">' + esc(sale.id) + '</b></div>' +
      '<div style="display:flex;justify-content:space-between;align-items:center"><span style="color:var(--muted)">Status</span><div>' + statusBadge + emailSentBadge + '</div></div>' +
    '</div>' +
    '<p style="text-align:center;color:var(--muted);font-size:.8rem;margin-bottom:14px">Obrigado pela compra!</p>' +
    '<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap">' +
      '<button class="b-green act" id="receiptWppBtn">📱 WhatsApp</button>' +
      '<button class="b-green act" id="receiptEmailBtn" style="background:linear-gradient(135deg,#1d4ed8,#3b82f6)">📧 Enviar E-mail</button>' +
      (sale.status === 'pago' && sale.keyCode && !(sale.emailSent && sale.emailSent.approval)
        ? '<button class="b-green act" id="receiptApprovalBtn" style="background:linear-gradient(135deg,#15803d,#22c55e)">✅ Enviar Aprovação</button>'
        : '') +
      '<button class="b-gray act" id="receiptCopyBtn">📋 Copiar</button>' +
      '<button class="b-red act" id="receiptCloseBtn">✖ Fechar</button>' +
    '</div>';

  $('receiptWppBtn').onclick = () => sendWhatsAppReceipt(sale);
  $('receiptEmailBtn').onclick = () => sendSaleEmail(sale);
  const apprBtn = $('receiptApprovalBtn');
  if (apprBtn) apprBtn.onclick = async () => {
    if (!sale.buyerEmail) {
      toast('Cadastre o e-mail do cliente na venda para enviar a aprovação.', true);
      return;
    }
    apprBtn.disabled = true; apprBtn.textContent = '⏳ Enviando...';
    const r = await api('/api/admin/email/send-approval', { body: { saleId: sale.id } });
    if (r._status === 200) {
      toast('E-mail de aprovação enviado!');
      if (!sale.emailSent) sale.emailSent = {};
      sale.emailSent.approval = true;
      closeReceipt();
      loadSales();
    } else {
      toast(r.message || 'Erro ao enviar.', true);
      apprBtn.disabled = false; apprBtn.textContent = '✅ Enviar Aprovação';
    }
  };
  $('receiptCopyBtn').onclick = () => copyReceipt();
  $('receiptCloseBtn').onclick = () => closeReceipt();
  $('receiptModal').style.display = 'flex';
}

function closeReceipt() { $('receiptModal').style.display = 'none'; }

function copyReceipt() {
  if (!lastReceiptData) return;
  const s = lastReceiptData;
  const d = new Date(s.soldAt);
  const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const txt =
    '╔══════════════════════════════╗\n' +
    '║            AIMZY             ║\n' +
    '║     COMPROVANTE DE COMPRA    ║\n' +
    '╠══════════════════════════════╣\n' +
    '║ Cliente: ' + (s.buyerLabel || '—') + '\n' +
    '║ WhatsApp: ' + (s.buyerContact || '—') + '\n' +
    '║ Plano: ' + (s.plan || '—') + '\n' +
    '║ Valor: R$ ' + (s.price || 0).toFixed(2) + '\n' +
    '║ Pagamento: ' + (s.paymentMethod || '—') + '\n' +
    '║ Key: ' + (s.keyCode || '—') + '\n' +
    '║ Data: ' + dateStr + '\n' +
    '║ ID: ' + s.id + '\n' +
    '║ Status: ' + (s.status === 'pago' ? 'PAGO' : 'PENDENTE') + '\n' +
    '╚══════════════════════════════╝\n' +
    'Obrigado pela compra!';
  navigator.clipboard.writeText(txt).then(() => toast('Comprovante copiado!')).catch(() => prompt('Copie:', txt));
}

function sendWhatsAppReceipt(sale) {
  if (!sale || !sale.buyerContact) { toast('Número de WhatsApp não disponível.', true); return; }
  const d = new Date(sale.soldAt);
  const dateStr = d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const phone = sale.buyerContact.replace(/\D/g, '');
  const msg = encodeURIComponent(
    'Olá, ' + (sale.buyerLabel || 'Cliente') + '! 👋\n\n' +
    'Sua compra foi registrada com sucesso.\n\n' +
    '📦 Plano: ' + (sale.plan || '—') + '\n' +
    '💰 Valor: R$ ' + (sale.price || 0).toFixed(2) + '\n' +
    (sale.keyCode ? '🔑 Key: ' + sale.keyCode + '\n' : '') +
    '🧾 ID da venda: ' + sale.id + '\n' +
    '📅 Data: ' + dateStr + '\n\n' +
    'Obrigado pela compra! ❤️'
  );
  window.open('https://wa.me/' + phone + '?text=' + msg, '_blank');
}

async function sendSaleEmail(sale) {
  if (!sale) return;

  let emailAddr = sale.buyerEmail || '';
  if (!emailAddr) {
    emailAddr = prompt('Digite o e-mail do cliente para enviar o comprovante:', '');
    if (!emailAddr || !emailAddr.includes('@')) {
      toast('E-mail inválido.', true);
      return;
    }
  }

  const btn = document.querySelector('.email-btn');
  if (btn) { btn.disabled = true; btn.textContent = '⏳'; }

  const r = await api('/api/admin/email/send-purchase', { body: { saleId: sale.id, toEmail: emailAddr } });

  if (btn) { btn.disabled = false; btn.textContent = '📧'; }

  if (r._status === 200) {
    toast('Comprovante enviado para ' + emailAddr + '!');
    sale.buyerEmail = emailAddr;
    if (!sale.emailSent) sale.emailSent = {};
    sale.emailSent.purchase = true;
    loadSales();
  } else {
    toast(r.message || 'Erro ao enviar e-mail. Verifique se o Gmail está configurado.', true);
  }
}

function copyReceiptKey() {
  if (!lastReceiptData) return;
  navigator.clipboard.writeText(lastReceiptData.keyCode).then(() => toast('Key copiada!'));
}

function printReceipt() {
  const content = $('receiptBody').innerHTML;
  const w = window.open('', '', 'width=400,height=500');
  w.document.write('<html><head><title>AIMZY - Comprovante</title><style>body{font-family:monospace;padding:20px;background:#080404;color:#f5f0ee}b{color:#ef4444}.muted{color:#a89f9c}</style></head><body>' + content + '</body></html>');
  w.document.close();
  w.print();
}

/* ---------- central de avisos ---------- */

let userAnnouncement = null;

async function loadAnnouncement() {
  const r = await api('/api/announcement');
  if (r._status === 200 && r.announcement && r.announcement.message) {
    userAnnouncement = r.announcement;
    $('announceTitle').textContent = r.announcement.title || '⚠️ Aviso';
    $('announceMsg').textContent = r.announcement.message;
    $('announceModal').style.display = 'flex';
  }
}

function closeAnnounce() { $('announceModal').style.display = 'none'; }

/* ---------- preços ---------- */

const PLAN_LABELS = {
  '1h': '1 Hora', '2h': '2 Horas', '3h': '3 Horas', '6h': '6 Horas', '12h': '12 Horas',
  '1d': '1 Dia', '3d': '3 Dias', '7d': '7 Dias', '15d': '15 Dias', '30d': '30 Dias',
  'permanent': 'Permanente'
};

async function loadPrices() {
  const r = await api('/api/prices');
  if (r._status === 200 && r.prices) {
    currentPrices = r.prices;
    renderPricesForm('premium', r.prices.premium || {});
    renderPricesForm('vip', r.prices.vip || {});
  }
  loadPlans();
}

function renderPricesForm(type, prices) {
  const el = $(type === 'premium' ? 'premiumPricesForm' : 'vipPricesForm');
  const keys = type === 'premium'
    ? ['1h','2h','3h','6h','12h','1d','3d','7d','15d','30d','permanent']
    : ['1d','7d','30d','permanent'];

  el.innerHTML = keys.map(k => {
    return '<div style="display:flex;align-items:center;gap:12px">' +
      '<label style="width:120px;color:var(--muted)">' + PLAN_LABELS[k] + '</label>' +
      '<span style="color:#86efac">R$</span>' +
      '<input type="number" class="mini-inp price-input" data-type="' + type + '" data-plan="' + k + '" ' +
        'value="' + (prices[k] || 0) + '" step="0.01" min="0" style="width:100px">' +
    '</div>';
  }).join('');
}

$('savePricesBtn').addEventListener('click', async () => {
  document.querySelectorAll('.price-input').forEach(inp => {
    const type = inp.dataset.type;
    const plan = inp.dataset.plan;
    if (!currentPrices[type]) currentPrices[type] = {};
    currentPrices[type][plan] = parseFloat(inp.value) || 0;
  });
  const r = await api('/api/admin/prices', { method: 'PUT', body: { prices: currentPrices } });
  showMsg($('pricesMsg'), r._status === 200 ? 'Preços salvos com sucesso!' : 'Erro ao salvar.', r._status === 200);
});

/* ---------- planos personalizados ---------- */

let allPlans = [];

async function loadPlans() {
  const r = await api('/api/admin/plans');
  if (r._status === 200 && r.plans) allPlans = r.plans;
  renderPlans();
}

function renderPlans() {
  const tb = $('plansBody');
  if (!allPlans.length) {
    tb.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Nenhum plano personalizado. Clique em "+ Adicionar plano".</td></tr>';
    return;
  }
  tb.innerHTML = '';
  allPlans.forEach(p => {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;
    tr.innerHTML =
      '<td><select class="mini-inp p-type" style="width:auto;padding:8px">' +
        '<option value="premium"' + (p.type === 'premium' ? ' selected' : '') + '>🟦 Premium</option>' +
        '<option value="proibida"' + (p.type !== 'premium' ? ' selected' : '') + '>🔴 Proibida</option>' +
      '</select></td>' +
      '<td><input class="mini-inp p-name" style="width:150px" maxlength="60" placeholder="ex: Plano 2 dias" value="' + esc(p.name || '') + '"></td>' +
      '<td><input type="number" step="0.01" min="0" class="mini-inp p-price" style="width:90px" value="' + (Number(p.price) || 0) + '"></td>' +
      '<td><input type="checkbox" class="p-active"' + (p.active !== false ? ' checked' : '') + '></td>' +
      '<td><button class="b-red act p-del">Excluir</button></td>';
    tr.querySelector('.p-del').onclick = () => {
      allPlans = allPlans.filter(x => x.id !== p.id);
      renderPlans();
    };
    tb.appendChild(tr);
  });
}

$('addPlanBtn').addEventListener('click', () => {
  allPlans.push({
    id: 'plan_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type: 'premium',
    name: '',
    price: 0,
    active: true
  });
  renderPlans();
});

$('reloadPlansBtn').addEventListener('click', loadPlans);

$('savePlansBtn').addEventListener('click', async () => {
  const rows = $('plansBody').querySelectorAll('tr[data-id]');
  const out = [];
  rows.forEach(tr => {
    const name = tr.querySelector('.p-name').value.trim();
    if (!name) return;
    out.push({
      id: tr.dataset.id,
      type: tr.querySelector('.p-type').value,
      name: name,
      price: parseFloat(tr.querySelector('.p-price').value) || 0,
      active: tr.querySelector('.p-active').checked
    });
  });

  const r = await api('/api/admin/plans', { method: 'PUT', body: { plans: out } });
  if (r._status === 200) {
    showMsg($('plansMsg'), 'Planos salvos! Já aparecem no site.', true);
    allPlans = r.plans || out;
    renderPlans();
  } else {
    showMsg($('plansMsg'), r.message || 'Erro ao salvar planos.', false);
  }
});

/* ---------- boot ---------- */
boot();

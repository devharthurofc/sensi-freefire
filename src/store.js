'use strict';

const supabase = require('./lib/supabase');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ============ persistência ============
 * Cada entidade tem sua própria tabela no Supabase:
 *   admins, users, keys, sessions, generations,
 *   profiles, audit_log, settings
 *
 * Um espelho local em data/db.json continua sendo gravado
 * como backup / modo offline.
 *
 * O restante do código continua lendo/escrevendo em `db`.
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_DB = {
  meta: { createdAt: new Date().toISOString() },
  admins: [],
  users: [],
  keys: [],
  sessions: [],
  generations: [],
  profiles: [],
  sales: [],
  products: [],
  auditLog: [],
  settings: {
    contactLink: '',
    freeDailyLimit: 3,
    adminPanelPath: '',
    announcement: null,
    prices: {
      premium: {
        '1h': 1.50,
        '2h': 2.00,
        '3h': 2.50,
        '6h': 3.50,
        '12h': 3.50,
        '1d': 5.00,
        '3d': 6.00,
        '7d': 8.00,
        '15d': 10.00,
        '30d': 15.00,
        'permanent': 17.00
      },
      vip: {
        '1d': 1.00,
        '7d': 1.00,
        '30d': 1.00,
        'permanent': 1.00
      }
    }
  }
};

let db = null;
let saveTimer = null;
let writeChain = Promise.resolve();

function hydrate(parsed) {
  const merged = Object.assign(structuredClone(DEFAULT_DB), parsed || {});
  for (const key of Object.keys(DEFAULT_DB)) {
    if (merged[key] === undefined) {
      merged[key] = structuredClone(DEFAULT_DB[key]);
    }
  }
  return merged;
}

/* ============ carregar do Supabase (tabelas individuais) ============ */

async function fetchRemoteUsers() {
  const { data, error } = await supabase.from('users').select('*');
  if (error) throw error;
  return (data || []).map(u => ({
    id: u.id,
    deviceId: u.device_id,
    label: u.label,
    isVip: !!u.is_vip,
    vipSource: u.vip_source || null,
    vipKeyId: u.vip_key_id || null,
    vipSince: u.vip_since || null,
    createdAt: u.created_at,
    lastSeenAt: u.last_seen_at
  }));
}

async function fetchRemoteAdmins() {
  const { data, error } = await supabase.from('admins').select('*');
  if (error) throw error;
  return (data || []).map(a => ({
    id: a.id,
    username: a.username,
    passwordHash: a.password_hash,
    role: a.role || 'mod',
    createdAt: a.created_at,
    mustChange: a.must_change === true || a.must_change === 'true'
  }));
}

async function fetchRemoteKeys() {
  const { data, error } = await supabase.from('keys').select('*');
  if (error) throw error;
  return (data || []).map(k => ({
    id: k.id,
    code: k.code,
    status: k.status,
    createdAt: k.created_at,
    expiresAt: k.expires_at || null,
    maxUses: k.max_uses || 0,
    uses: k.uses || 0,
    activatedByUserId: k.activated_by_user_id || null,
    activatedByLabel: k.activated_by_label || null,
    activatedAt: k.activated_at || null
  }));
}

async function fetchRemoteSessions() {
  const { data, error } = await supabase.from('sessions').select('*');
  if (error) throw error;
  return (data || []).map(s => ({
    token: s.token,
    userId: s.user_id || null,
    adminId: s.admin_id || null,
    isAdmin: !!s.is_admin,
    createdAt: s.created_at,
    expiresAt: s.expires_at
  }));
}

async function fetchRemoteGenerations() {
  const { data, error } = await supabase.from('generations').select('*');
  if (error) throw error;
  return (data || []).map(g => {
    const extra = g.data || {};
    return {
      id: g.id,
      at: g.at,
      userId: g.user_id,
      mode: g.mode,
      inputs: extra.inputs || {},
      values: extra.values || {},
      dpi: extra.dpi,
      fireButton: extra.fireButton,
      deviceName: extra.deviceName || null,
      knownDevice: !!extra.knownDevice
    };
  });
}

async function fetchRemoteProfiles() {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) throw error;
  return (data || []).map(p => ({
    id: p.id,
    userId: p.user_id,
    name: p.name,
    inputs: p.inputs || {},
    at: p.at
  }));
}

async function fetchRemoteAudit() {
  const { data, error } = await supabase.from('audit_log').select('*').order('at', { ascending: false }).limit(400);
  if (error) throw error;
  return (data || []).map(a => ({
    at: a.at,
    action: a.action,
    detail: a.detail || '',
    ip: a.ip || ''
  }));
}

async function fetchRemoteSettings() {
  const { data, error } = await supabase.from('settings').select('*').limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return { contactLink: '', freeDailyLimit: 3, adminPanelPath: '', announcement: null, prices: {} };
  return {
    contactLink: data.contact_link || '',
    freeDailyLimit: data.free_daily_limit != null ? data.free_daily_limit : 3,
    adminPanelPath: data.admin_panel_path || '',
    announcement: data.announcement || null,
    prices: data.prices || {}
  };
}

async function fetchRemoteSales() {
  const { data, error } = await supabase.from('vendas').select('*');
  if (error) throw error;
  return (data || []).map(s => ({
    id: s.id,
    keyId: s.key_id,
    keyCode: s.key_code,
    price: s.price || 0,
    buyerLabel: s.buyer_label || '',
    buyerContact: s.buyer_contact || '',
    sellerAdminId: s.seller_admin_id || '',
    sellerAdminName: s.seller_admin_name || '',
    soldAt: s.sold_at,
    notes: s.notes || '',
    status: s.status || 'pago'
  }));
}

/* ============ salvar no Supabase (tabelas individuais) ============ */

function toUserRow(u) {
  return {
    id: u.id,
    device_id: u.deviceId,
    label: u.label,
    is_vip: !!u.isVip,
    vip_source: u.vipSource || null,
    vip_key_id: u.vipKeyId || null,
    vip_since: u.vipSince || null,
    created_at: u.createdAt,
    last_seen_at: u.lastSeenAt
  };
}

function toAdminRow(a) {
  return {
    id: a.id,
    username: a.username,
    password_hash: a.passwordHash,
    role: a.role || 'mod',
    created_at: a.createdAt,
    must_change: !!a.mustChange
  };
}

function toKeyRow(k) {
  return {
    id: k.id,
    code: k.code,
    status: k.status,
    created_at: k.createdAt,
    expires_at: k.expiresAt || null,
    max_uses: k.maxUses || 0,
    uses: k.uses || 0,
    activated_by_user_id: k.activatedByUserId || null,
    activated_by_label: k.activatedByLabel || null,
    activated_at: k.activatedAt || null
  };
}

function toSessionRow(s) {
  return {
    token: s.token,
    user_id: s.userId || null,
    admin_id: s.adminId || null,
    is_admin: !!s.isAdmin,
    created_at: s.createdAt,
    expires_at: s.expiresAt
  };
}

function toGenerationRow(g) {
  return {
    id: g.id,
    at: g.at,
    user_id: g.userId,
    mode: g.mode,
    data: {
      inputs: g.inputs,
      values: g.values,
      dpi: g.dpi,
      fireButton: g.fireButton,
      deviceName: g.deviceName || null,
      knownDevice: !!g.knownDevice
    }
  };
}

function toProfileRow(p) {
  return {
    id: p.id,
    user_id: p.userId,
    name: p.name,
    inputs: p.inputs,
    at: p.at
  };
}

function toSalesRow(s) {
  return {
    id: s.id,
    key_id: s.keyId,
    key_code: s.keyCode,
    price: s.price || 0,
    buyer_label: s.buyerLabel || '',
    buyer_contact: s.buyerContact || '',
    seller_admin_id: s.sellerAdminId || '',
    seller_admin_name: s.sellerAdminName || '',
    sold_at: s.soldAt,
    notes: s.notes || '',
    status: s.status || 'pago'
  };
}

async function pushAllRemote() {
  const d = getDb();

  const ops = [
    supabase.from('users').upsert(d.users.map(toUserRow), { onConflict: 'id' }),
    supabase.from('keys').upsert(d.keys.map(toKeyRow), { onConflict: 'id' }),
    supabase.from('sessions').upsert(d.sessions.map(toSessionRow), { onConflict: 'token' }),
    supabase.from('generations').upsert(d.generations.map(toGenerationRow), { onConflict: 'id' }),
    supabase.from('profiles').upsert(d.profiles.map(toProfileRow), { onConflict: 'id' }),
    supabase.from('vendas').upsert(d.sales.map(toSalesRow), { onConflict: 'id' }),
    supabase.from('audit_log').upsert(
      d.auditLog.map((a, i) => ({ id: 'log_' + i, at: a.at, action: a.action, detail: a.detail, ip: a.ip })),
      { onConflict: 'id' }
    )
  ];

  // admins: upsert sem role/must_change (colunas podem não existir)
  for (const a of d.admins) {
    ops.push(
      supabase.from('admins').upsert({
        id: a.id,
        username: a.username,
        password_hash: a.passwordHash,
        created_at: a.createdAt
      }, { onConflict: 'id' })
    );
  }

  // settings: pegar id existente ou inserir
  try {
    const { data: existing } = await supabase.from('settings').select('id').limit(1).maybeSingle();
    const settingsId = existing ? existing.id : undefined;
    ops.push(
      supabase.from('settings').upsert({
        ...(settingsId ? { id: settingsId } : {}),
        contact_link: d.settings.contactLink || '',
        free_daily_limit: d.settings.freeDailyLimit != null ? d.settings.freeDailyLimit : 3,
        admin_panel_path: d.settings.adminPanelPath || '',
        announcement: d.settings.announcement || null,
        prices: d.settings.prices || {}
      }, { onConflict: 'id' })
    );
  } catch (_) {}

  await Promise.all(ops);
}

/* ============ espelho local ============ */

function writeLocalMirror() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function readLocalMirror() {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    console.error('[store] db.json corrompido, ignorando cópia local...');
    try { fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); } catch (_) {}
    return null;
  }
}

/* ============ inicialização ============ */

async function init() {
  let remote = null;
  let online = true;

  try {
    const [users, admins, keys, sessions, generations, profiles, auditLog, settings, sales] = await Promise.all([
      fetchRemoteUsers(),
      fetchRemoteAdmins(),
      fetchRemoteKeys(),
      fetchRemoteSessions(),
      fetchRemoteGenerations(),
      fetchRemoteProfiles(),
      fetchRemoteAudit(),
      fetchRemoteSettings(),
      fetchRemoteSales()
    ]);

    remote = { users, admins, keys, sessions, generations, profiles, auditLog, settings, sales };
  } catch (e) {
    online = false;
    console.error('[store] Supabase indisponível no boot:', e.message);
  }

  const local = readLocalMirror();

  if (remote && (remote.users.length || remote.admins.length || remote.keys.length)) {
    db = hydrate(remote);
    console.log('[store] Banco carregado do Supabase ✔ (' + db.users.length + ' usuários, ' + db.keys.length + ' keys)');
  } else if (local) {
    db = hydrate(local);
    console.log(
      online
        ? '[store] Supabase vazio -> dados locais migrados ✔ (' + db.users.length + ' usuários, ' + db.keys.length + ' keys)'
        : '[store] Usando cópia local (Supabase inacessível)'
    );
    if (online && db.users.length) {
      await pushAllRemote().catch(e => console.error('[store] falha na migração inicial:', e.message));
    }
  } else {
    db = structuredClone(DEFAULT_DB);
    console.log('[store] Banco novo criado');
  }

  persistNow();
  return db;
}

function persistNow() {
  if (!db) return Promise.resolve();

  try { writeLocalMirror(); } catch (e) {
    console.error('[store] falha no espelho local:', e.message);
  }

  const snapshot = structuredClone(db);
  const job = () => pushAllRemote().then(() => {}).catch(e => {
    console.error('[store] falha ao salvar no Supabase:', e.message);
  });
  writeChain = writeChain.then(job, job);
  return writeChain;
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; persistNow(); }, 150);
}

async function shutdown() {
  try {
    await Promise.race([
      writeChain.catch(() => {}),
      new Promise(resolve => setTimeout(resolve, 4000))
    ]);
  } catch (_) {}
}

function getDb() {
  if (!db) db = hydrate(readLocalMirror());
  return db;
}

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(9).toString('hex');
}

/* ============ usuários ============ */

function findUserByDevice(deviceId) {
  return getDb().users.find(u => u.deviceId === deviceId) || null;
}

function findUserById(userId) {
  return getDb().users.find(u => u.id === userId) || null;
}

function createUser(deviceId) {
  const n = getDb().users.length + 1;
  const user = {
    id: id('usr'),
    deviceId,
    label: 'Jogador #' + String(n).padStart(4, '0'),
    isVip: false,
    vipSource: null,
    vipKeyId: null,
    vipSince: null,
    createdAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString()
  };
  getDb().users.push(user);
  scheduleSave();
  return user;
}

function touchUser(user) {
  user.lastSeenAt = new Date().toISOString();
  scheduleSave();
}

function setUserVip(user, isVip, source, keyId, vipType) {
  user.isVip = !!isVip;
  user.vipSource = isVip ? source || 'admin' : null;
  user.vipKeyId = isVip ? keyId || null : null;
  user.vipSince = isVip ? new Date().toISOString() : null;
  user.vipType = isVip ? (vipType || 'premium') : null;
  persistNow();
}

/* ============ sessões ============ */

const USER_SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
const ADMIN_SESSION_TTL_MS = 12 * 3600 * 1000;

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().sessions.push({
    token,
    userId: user.id,
    isAdmin: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + USER_SESSION_TTL_MS).toISOString()
  });
  scheduleSave();
  return token;
}

function createAdminSession(admin) {
  const token = crypto.randomBytes(32).toString('hex');
  getDb().sessions.push({
    token,
    userId: null,
    adminId: admin.id,
    isAdmin: true,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + ADMIN_SESSION_TTL_MS).toISOString()
  });
  scheduleSave();
  return token;
}

function findSession(token) {
  if (!token || typeof token !== 'string') return null;
  const d = getDb();
  const i = d.sessions.findIndex(s => s.token === token);
  if (i < 0) return null;
  const s = d.sessions[i];
  if (!s.expiresAt || new Date(s.expiresAt).getTime() <= Date.now()) {
    d.sessions.splice(i, 1);
    scheduleSave();
    return null;
  }
  return s;
}

function pruneSessions() {
  const d = getDb();
  const now = Date.now();
  const before = d.sessions.length;
  d.sessions = d.sessions.filter(s => s.expiresAt && new Date(s.expiresAt).getTime() > now);
  if (d.sessions.length !== before) scheduleSave();
}

/* ============ auditoria ============ */

function addAudit(action, detail, ip) {
  const d = getDb();
  d.auditLog.push({
    at: new Date().toISOString(),
    action,
    detail: String(detail || '').slice(0, 200),
    ip: String(ip || '').slice(0, 60)
  });
  if (d.auditLog.length > 400) d.auditLog = d.auditLog.slice(-400);
  scheduleSave();
}

function listAudit(limit = 60) {
  return [...getDb().auditLog].reverse().slice(0, limit);
}

function destroySession(token) {
  const d = getDb();
  const i = d.sessions.findIndex(s => s.token === token);
  if (i >= 0) { d.sessions.splice(i, 1); scheduleSave(); }
}

/* ============ keys ============ */

function normalizeKey(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function findKeyByCode(code) {
  const norm = normalizeKey(code);
  return getDb().keys.find(k => k.code === norm) || null;
}

function generateKeyCode(type) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () => Array.from(crypto.randomBytes(4)).map(b => alphabet[b % alphabet.length]).join('');
  let prefix = 'AIMZY';
  if (type === 'premium') prefix = 'AIM-PREM';
  else if (type === 'vip') prefix = 'AIM-VIP';
  let code;
  let tries = 0;
  do { code = prefix + '-' + block().slice(0, 4) + '-' + block().slice(0, 4); tries++; }
  while (findKeyByCode(code) && tries < 50);
  return code;
}

function createKey({ expiresAt = null, maxUses = 1, type = 'premium' }) {
  const code = generateKeyCode(type);
  const key = {
    id: id('key'),
    code,
    type: type === 'vip' ? 'vip' : 'premium',
    status: 'ativa',
    createdAt: new Date().toISOString(),
    expiresAt: expiresAt || null,
    maxUses: Number.isInteger(maxUses) && maxUses > 0 ? maxUses : 0,
    uses: 0,
    activatedByUserId: null,
    activatedByLabel: null,
    activatedAt: null
  };
  getDb().keys.push(key);
  persistNow();
  return key;
}

function saveKey(key) {
  const d = getDb();
  const i = d.keys.findIndex(k => k.id === key.id);
  if (i >= 0) d.keys[i] = key;
  persistNow();
}

function deleteKey(keyId) {
  const d = getDb();
  const i = d.keys.findIndex(k => k.id === keyId);
  if (i >= 0) { d.keys.splice(i, 1); persistNow(); return true; }
  return false;
}

function isKeyExpired(key) {
  return !!(key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now());
}

function keyUsesLeft(key) {
  if (!key.maxUses) return Infinity;
  return Math.max(0, key.maxUses - key.uses);
}

/* ============ gerações / histórico ============ */

function addGeneration(entry) {
  const g = Object.assign({ id: id('gen'), at: new Date().toISOString() }, entry);
  getDb().generations.push(g);
  scheduleSave();
  return g;
}

function countFreeToday(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().generations.filter(g =>
    g.userId === userId &&
    ['normal', 'free', 'iphone'].includes(g.mode) &&
    g.at.slice(0, 10) === today
  ).length;
}

function listHistory(userId, limit = 100) {
  return getDb().generations
    .filter(g => g.userId === userId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/* ============ perfis salvos ============ */

function listProfiles(userId) {
  return getDb().profiles
    .filter(p => p.userId === userId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

function addProfile(userId, name, inputs) {
  const p = {
    id: id('prf'),
    userId,
    name: String(name).slice(0, 40),
    inputs,
    at: new Date().toISOString()
  };
  getDb().profiles.push(p);
  scheduleSave();
  return p;
}

function deleteProfile(userId, profileId) {
  const d = getDb();
  const i = d.profiles.findIndex(p => p.id === profileId && p.userId === userId);
  if (i >= 0) { d.profiles.splice(i, 1); scheduleSave(); return true; }
  return false;
}

/* ============ settings ============ */

function getSettings() {
  return getDb().settings;
}

function updateSettings(patch) {
  const s = getSettings();
  if (typeof patch.contactLink === 'string') s.contactLink = patch.contactLink.trim();
  if (patch.freeDailyLimit !== undefined) {
    const n = parseInt(patch.freeDailyLimit, 10);
    if (Number.isInteger(n) && n >= 0) s.freeDailyLimit = n;
  }
  if (typeof patch.adminPanelPath === 'string') {
    let v = patch.adminPanelPath.trim().toLowerCase();
    if (v && !v.startsWith('/')) v = '/' + v;
    if (!v || /^\/[a-z0-9_-]{2,60}(?:\/[a-z0-9_-]{1,60})*$/.test(v)) {
      s.adminPanelPath = v || '/admin';
    }
  }
  persistNow();
  return s;
}

/* ============ vendas ============ */

function addSale({ keyId, keyCode, price, buyerLabel, buyerContact, product, plan, paymentMethod, sellerAdminId, sellerAdminName, notes, status }) {
  const sale = {
    id: id('sale'),
    keyId: keyId || null,
    keyCode: keyCode || '',
    price: Number(price) || 0,
    buyerLabel: buyerLabel || '',
    buyerContact: buyerContact || '',
    product: product || '',
    plan: plan || '',
    paymentMethod: paymentMethod || '',
    sellerAdminId: sellerAdminId || '',
    sellerAdminName: sellerAdminName || '',
    soldAt: new Date().toISOString(),
    notes: notes || '',
    status: status || 'pago'
  };
  getDb().sales.push(sale);
  persistNow();
  return sale;
}

function listSales(limit = 200) {
  return [...getDb().sales].sort((a, b) => b.soldAt.localeCompare(a.soldAt)).slice(0, limit);
}

function getSalesStats() {
  const sales = getDb().sales;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  const weekStr = startOfWeek.toISOString().slice(0, 10);

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthStr = startOfMonth.toISOString().slice(0, 10);

  const totalRevenue = sales.reduce((sum, s) => sum + (s.price || 0), 0);
  const totalSales = sales.length;
  const paidSales = sales.filter(s => s.status === 'pago').length;
  const pendingSales = sales.filter(s => s.status === 'pendente').length;

  const salesToday = sales.filter(s => s.soldAt && s.soldAt.slice(0, 10) === today);
  const revenueToday = salesToday.reduce((sum, s) => sum + (s.price || 0), 0);

  const salesYesterday = sales.filter(s => s.soldAt && s.soldAt.slice(0, 10) === yesterdayStr);
  const revenueYesterday = salesYesterday.reduce((sum, s) => sum + (s.price || 0), 0);

  const salesWeek = sales.filter(s => s.soldAt && s.soldAt.slice(0, 10) >= weekStr);
  const revenueWeek = salesWeek.reduce((sum, s) => sum + (s.price || 0), 0);

  const salesMonth = sales.filter(s => s.soldAt && s.soldAt.slice(0, 10) >= monthStr);
  const revenueMonth = salesMonth.reduce((sum, s) => sum + (s.price || 0), 0);

  const last7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const dStr = d.toISOString().slice(0, 10);
    const daySales = sales.filter(s => s.soldAt && s.soldAt.slice(0, 10) === dStr);
    last7.push({
      date: dStr,
      label: d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' }),
      count: daySales.length,
      revenue: daySales.reduce((sum, s) => sum + (s.price || 0), 0)
    });
  }

  return {
    totalRevenue, totalSales, paidSales, pendingSales,
    salesToday: salesToday.length, revenueToday,
    salesYesterday: salesYesterday.length, revenueYesterday,
    salesWeek: salesWeek.length, revenueWeek,
    salesMonth: salesMonth.length, revenueMonth,
    last7Days: last7
  };
}

function updateSale(saleId, patch) {
  const d = getDb();
  const i = d.sales.findIndex(s => s.id === saleId);
  if (i < 0) return null;
  const sale = d.sales[i];
  if (patch.price !== undefined) sale.price = Number(patch.price) || 0;
  if (patch.buyerLabel !== undefined) sale.buyerLabel = patch.buyerLabel;
  if (patch.buyerContact !== undefined) sale.buyerContact = patch.buyerContact;
  if (patch.product !== undefined) sale.product = clean(patch.product, 80);
  if (patch.plan !== undefined) sale.plan = clean(patch.plan, 60);
  if (patch.paymentMethod !== undefined) sale.paymentMethod = clean(patch.paymentMethod, 30);
  if (patch.notes !== undefined) sale.notes = patch.notes;
  if (patch.status !== undefined) sale.status = patch.status;
  persistNow();
  return sale;
}

function deleteSale(saleId) {
  const d = getDb();
  const i = d.sales.findIndex(s => s.id === saleId);
  if (i >= 0) { d.sales.splice(i, 1); persistNow(); return true; }
  return false;
}

/* ============ products / planos ============ */

function listProducts() {
  return [...getDb().products].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function findProduct(productId) {
  return getDb().products.find(p => p.id === productId) || null;
}

function addProduct(data) {
  const d = getDb();
  const product = {
    id: id(),
    name: clean(data.name, 80),
    description: clean(data.description, 300),
    active: data.active !== false,
    plans: Array.isArray(data.plans) ? data.plans.map(p => ({
      id: id(),
      name: clean(p.name, 60),
      duration: clean(p.duration, 40),
      price: Number(p.price) || 0,
      active: p.active !== false
    })) : [],
    createdAt: new Date().toISOString()
  };
  d.products.push(product);
  persistNow();
  return product;
}

function updateProduct(productId, patch) {
  const d = getDb();
  const product = d.products.find(p => p.id === productId);
  if (!product) return null;
  if (patch.name !== undefined) product.name = clean(patch.name, 80);
  if (patch.description !== undefined) product.description = clean(patch.description, 300);
  if (patch.active !== undefined) product.active = patch.active;
  if (patch.plans !== undefined && Array.isArray(patch.plans)) {
    product.plans = patch.plans.map(p => ({
      id: p.id || id(),
      name: clean(p.name, 60),
      duration: clean(p.duration, 40),
      price: Number(p.price) || 0,
      active: p.active !== false
    }));
  }
  persistNow();
  return product;
}

function deleteProduct(productId) {
  const d = getDb();
  const i = d.products.findIndex(p => p.id === productId);
  if (i >= 0) { d.products.splice(i, 1); persistNow(); return true; }
  return false;
}

/* ============ exports ============ */

module.exports = {
  getDb,
  load: readLocalMirror,
  persistNow,
  init,
  shutdown,
  id,
  clean: (v, max) => typeof v === 'string' ? v.trim().slice(0, max || 120) : '',

  findUserByDevice,
  findUserById,
  createUser,
  touchUser,
  setUserVip,

  createSession,
  createAdminSession,
  findSession,
  destroySession,
  pruneSessions,

  findKeyByCode,
  normalizeKey,
  createKey,
  saveKey,
  deleteKey,
  isKeyExpired,
  keyUsesLeft,

  addGeneration,
  countFreeToday,
  listHistory,

  listProfiles,
  addProfile,
  deleteProfile,

  getSettings,
  updateSettings,

  addSale,
  listSales,
  getSalesStats,
  updateSale,
  deleteSale,

  listProducts,
  findProduct,
  addProduct,
  updateProduct,
  deleteProduct,

  addAudit,
  listAudit
};

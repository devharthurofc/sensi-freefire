'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');

const store = require('./src/store');
const engine = require('./src/engine');
const devices = require('./src/devices');

const app = express();
const PORT = process.env.PORT || 3000;

// Necessário para o rate limiting funcionar certo atrás de hospedagens (Render/Railway etc.)
app.set('trust proxy', 1);

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

/* ================= headers de segurança ================= */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; " +
    "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
  );
  // painel e APIs de admin nunca ficam em cache
  const panelPath = store.getSettings().adminPanelPath || '/admin';
  if (req.path.startsWith('/api/admin') || req.path === panelPath) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
  }
  next();
});

/* ================= utilidades de segurança ================= */

function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch (_) {
    return false;
  }
}

function rateLimiter({ windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, arr] of hits) {
      const alive = arr.filter(t => now - t < windowMs);
      if (alive.length === 0) hits.delete(k); else hits.set(k, alive);
    }
  }, windowMs).unref();
  return function limiter(req, res, next) {
    const ip = req.ip || req.connection.remoteAddress || '?';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
    if (arr.length >= max) {
      return res.status(429).json({ error: 'rate_limit', message });
    }
    arr.push(now);
    hits.set(ip, arr);
    next();
  };
}

function cleanStr(v, maxLen = 120) {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, maxLen);
}

function getToken(req) {
  const h = req.headers['authorization'] || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

function getCookie(req, name) {
  const h = req.headers.cookie || '';
  const m = h.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function currentUser(req) {
  const sess = store.findSession(getToken(req));
  if (!sess || sess.isAdmin) return null;
  const user = store.findUserById(sess.userId);
  if (!user) return null;
  refreshUserVip(user);
  return user;
}

/* Revalida o VIP do usuário: se a KEY expirou ou foi desativada, o acesso cai. */
function refreshUserVip(user) {
  if (!user.isVip || user.vipSource !== 'key') return user;
  const key = store.getDb().keys.find(k => k.id === user.vipKeyId);
  if (!key || key.status !== 'ativa' || store.isKeyExpired(key)) {
    store.setUserVip(user, false);
    user._vipRevoked = true;
  }
  return user;
}

function vipExpiresAtOf(user) {
  if (!user.isVip || user.vipSource !== 'key') return null;
  const key = store.getDb().keys.find(k => k.id === user.vipKeyId);
  return key && key.expiresAt ? key.expiresAt : null;
}

function requireUser(req, res, next) {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized', message: 'Sessão expirada. Recarregue a página.' });
  req.user = user;
  store.touchUser(user);
  next();
}

function requireVip(req, res, next) {
  requireUser(req, res, () => {
    if (!req.user.isVip) {
      return res.status(403).json({
        error: 'vip_required',
        upsell: true,
        title: 'Recurso VIP',
        message: 'Desbloqueie configurações avançadas e mais personalização.'
      });
    }
    next();
  });
}

const ADMIN_COOKIE = 'sensi_admin';

function findValidAdminSession(req) {
  const token = getToken(req) || getCookie(req, ADMIN_COOKIE);
  const sess = store.findSession(token);
  if (!sess || !sess.isAdmin) return null;
  return sess;
}

function requireAdmin(req, res, next) {
  const sess = findValidAdminSession(req);
  if (!sess) {
    return res.status(403).json({ error: 'forbidden', message: 'Acesso restrito a administradores.' });
  }
  req.adminId = sess.adminId;
  next();
}

function requireOwner(req, res, next) {
  const admin = store.getDb().admins.find(a => a.id === req.adminId);
  if (!admin || admin.role !== 'owner') {
    return res.status(403).json({ error: 'forbidden', message: 'Apenas o dono pode fazer isso.' });
  }
  next();
}

/* ================= sessão / usuário ================= */

app.post('/api/session/init', (req, res) => {
  const deviceId = cleanStr(req.body && req.body.deviceId, 64);
  if (!deviceId || !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)) {
    return res.status(400).json({ error: 'bad_request', message: 'Identificador de dispositivo inválido.' });
  }
  let user = store.findUserByDevice(deviceId);
  if (!user) user = store.createUser(deviceId);
  refreshUserVip(user);
  const token = store.createSession(user);
  res.json({
    token,
    user: { id: user.id, label: user.label, isVip: !!user.isVip, vipExpiresAt: vipExpiresAtOf(user) },
    settings: { contactLink: store.getSettings().contactLink || '' }
  });
});

app.get('/api/me', (req, res) => {
  const user = currentUser(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  res.json({ user: { id: user.id, label: user.label, isVip: !!user.isVip, vipExpiresAt: vipExpiresAtOf(user) } });
});

app.post('/api/session/logout', (req, res) => {
  const t = getToken(req);
  if (t) store.destroySession(t);
  res.json({ ok: true });
});

/* ================= informações públicas ================= */

app.get('/api/settings/public', (req, res) => {
  const s = store.getSettings();
  res.json({ contactLink: s.contactLink || '', freeDailyLimit: s.freeDailyLimit });
});

app.get('/api/devices/names', (req, res) => {
  res.json({ devices: devices.deviceNames() });
});

/* ================= ativação de KEY (com rate limiting) ================= */

const keyLimiter = rateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 8,
  message: 'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
});

app.post('/api/key/activate', keyLimiter, requireUser, (req, res) => {
  const code = cleanStr(req.body && req.body.key, 32);
  if (!code) return res.status(400).json({ status: 'invalid', message: '❌ KEY inválida ou expirada.' });

  const key = store.findKeyByCode(code);

  if (!key || key.status !== 'ativa') {
    return res.json({ status: 'invalid', message: '❌ KEY inválida ou expirada.' });
  }
  if (store.isKeyExpired(key)) {
    key.status = 'expirada';
    store.saveKey(key);
    return res.json({ status: 'expired', message: '⏰ Esta KEY expirou.' });
  }
  if (store.keyUsesLeft(key) <= 0 && key.activatedByUserId !== req.user.id) {
    return res.json({ status: 'exhausted', message: '⚠️ Esta KEY não possui mais usos disponíveis.' });
  }

  if (key.activatedByUserId === req.user.id && req.user.isVip) {
    return res.json({ status: 'ok', message: '✅ KEY ativada com sucesso!', user: { isVip: true, vipExpiresAt: vipExpiresAtOf(req.user) } });
  }

  key.uses += 1;
  key.activatedByUserId = req.user.id;
  key.activatedByLabel = req.user.label;
  key.activatedAt = new Date().toISOString();
  store.saveKey(key);

  store.setUserVip(req.user, true, 'key', key.id);

  res.json({ status: 'ok', message: '✅ KEY ativada com sucesso!', user: { isVip: true, vipExpiresAt: vipExpiresAtOf(req.user) } });
});

/* ================= geração ================= */

function recordGen(user, mode, inputs, result) {
  store.addGeneration({
    userId: user.id,
    mode,
    inputs,
    values: result.values,
    dpi: result.dpi,
    fireButton: result.fireButton,
    deviceName: result.deviceName || null,
    knownDevice: !!result.knownDevice
  });
}

app.post('/api/generate/free', requireUser, (req, res) => {
  const b = req.body || {};
  const deviceModel = cleanStr(b.deviceModel, 60);
  if (!deviceModel) {
    return res.status(400).json({ error: 'missing_model', message: 'Informe o modelo do seu celular para continuar.' });
  }
  const limit = store.getSettings().freeDailyLimit;
  if (req.user.isVip) {
    const result = engine.generateFree({ deviceModel, ram: b.ram, style: b.style });
    recordGen(req.user, 'free', { deviceModel, ram: b.ram, style: b.style }, result);
    return res.json({ ...result, remaining: null, unlimited: true });
  }
  const used = store.countFreeToday(req.user.id);
  if (limit > 0 && used >= limit) {
    return res.status(429).json({
      error: 'daily_limit',
      message: `Você atingiu o limite de ${limit} gerações de hoje no modo FREE. Ative uma KEY VIP para gerar sem limites.`,
      used,
      limit
    });
  }
  const result = engine.generateFree({ deviceModel, ram: b.ram, style: b.style });
  recordGen(req.user, 'free', { deviceModel, ram: b.ram, style: b.style }, result);
  const remaining = Math.max(0, limit - (used + 1));
  res.json({ ...result, remaining, limit });
});

app.post('/api/generate/vip', requireVip, (req, res) => {
  const b = req.body || {};
  const inputs = {
    brand: cleanStr(b.brand, 30),
    ram: b.ram, refreshHz: b.refreshHz, fps: b.fps,
    style: b.style, level: b.level, aim: b.aim,
    dpiAtual: b.dpiAtual
  };
  const result = engine.generateVip(inputs);
  recordGen(req.user, 'vip', inputs, result);
  res.json(result);
});

app.post('/api/generate/gerado', requireVip, (req, res) => {
  const b = req.body || {};
  const deviceModel = cleanStr(b.deviceModel, 60);
  if (!deviceModel) {
    return res.status(400).json({ error: 'missing_model', message: 'Informe o modelo do seu celular para continuar.' });
  }
  const inputs = {
    deviceModel,
    brand: cleanStr(b.brand, 30),
    ram: b.ram, refreshHz: b.refreshHz, fps: b.fps,
    dpiAtual: b.dpiAtual, style: b.style, level: b.level, aim: b.aim
  };
  const result = engine.generateGerado(inputs);
  if (result.error) return res.status(400).json({ error: 'missing_model', message: result.message });
  recordGen(req.user, 'gerado', inputs, result);
  res.json(result);
});

app.post('/api/generate/iphone', requireUser, (req, res) => {
  const b = req.body || {};
  const deviceModel = cleanStr(b.deviceModel, 60);
  if (!deviceModel) {
    return res.status(400).json({ error: 'missing_model', message: 'Escolha o modelo do seu iPhone para continuar.' });
  }
  const result = engine.generateIphone({
    deviceModel,
    style: b.style, level: b.level, aim: b.aim, refreshHz: b.refreshHz
  });
  if (result.error) {
    return res.status(400).json({ error: 'bad_model', message: result.message });
  }
  const inputs = { deviceModel, style: b.style, level: b.level, aim: b.aim, refreshHz: b.refreshHz };
  if (!req.user.isVip) {
    const limit = store.getSettings().freeDailyLimit;
    const used = store.countFreeToday(req.user.id);
    if (limit > 0 && used >= limit) {
      return res.status(429).json({
        error: 'daily_limit',
        message: `Você atingiu o limite de ${limit} gerações de hoje. Ative uma KEY VIP para gerar sem limites.`,
        used,
        limit
      });
    }
    recordGen(req.user, 'iphone', inputs, result);
    return res.json({ ...result, remaining: Math.max(0, limit - (used + 1)), limit });
  }
  recordGen(req.user, 'iphone', inputs, result);
  res.json({ ...result, remaining: null, unlimited: true });
});

/* ================= histórico (VIP) ================= */

app.get('/api/history', requireVip, (req, res) => {
  res.json({ history: store.listHistory(req.user.id, 60) });
});

/* ================= perfis salvos (VIP) ================= */

app.get('/api/profiles', requireVip, (req, res) => {
  res.json({ profiles: store.listProfiles(req.user.id) });
});

app.post('/api/profiles', requireVip, (req, res) => {
  const name = cleanStr(req.body && req.body.name, 40);
  const inputs = (req.body && req.body.inputs) || {};
  if (!name) return res.status(400).json({ error: 'bad_request', message: 'Dê um nome ao perfil.' });
  if (store.listProfiles(req.user.id).length >= 20) {
    return res.status(400).json({ error: 'bad_request', message: 'Limite de 20 perfis salvos atingido.' });
  }
  const p = store.addProfile(req.user.id, name, inputs);
  res.json({ profile: p });
});

app.delete('/api/profiles/:id', requireVip, (req, res) => {
  const ok = store.deleteProfile(req.user.id, req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  res.json({ ok: true });
});

/* ================= administração ================= */

const adminLoginLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Muitas tentativas de login. Tente novamente em alguns minutos.'
});

/* Bloqueio progressivo por usuário: 5 erros = 15 min travado */
const loginLocks = new Map();
function isLocked(username) {
  const l = loginLocks.get(username);
  if (!l) return false;
  if (l.until && Date.now() < l.until) return true;
  if (l.until && Date.now() >= l.until) { loginLocks.delete(username); }
  return false;
}
function registerFail(username) {
  const l = loginLocks.get(username) || { count: 0, until: null };
  l.count += 1;
  if (l.count >= 5) {
    l.until = Date.now() + 15 * 60 * 1000;
    l.count = 0;
  }
  loginLocks.set(username, l);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function ensureDefaultAdmin() {
  const db = store.getDb();
  // normaliza contas antigas sem role
  db.admins.forEach((a, i) => { if (!a.role) a.role = i === 0 ? 'owner' : 'mod'; });
  if (db.admins.length === 0) {
    const pass = process.env.ADMIN_PASSWORD || 'sensi-admin-2026';
    db.admins.push({
      id: store.id('adm'),
      username: process.env.ADMIN_USERNAME || 'admin',
      passwordHash: hashPassword(pass),
      role: 'owner',
      createdAt: new Date().toISOString(),
      mustChange: !process.env.ADMIN_PASSWORD
    });
    store.persistNow();
    console.log('==============================================================');
    console.log('  DONO criado -> usuário: admin | senha: ' + pass);
    console.log('  (definida pela env ADMIN_PASSWORD ou padrão acima)');
    console.log('  Troque a senha no painel administrativo após o primeiro acesso.');
    console.log('==============================================================');
  }
}

app.post('/api/admin/login', adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  const uname = cleanStr(username, 40);
  const ip = req.ip || '?';

  if (isLocked(uname)) {
    store.addAudit('login_locked', 'usuário: ' + uname, ip);
    await sleep(400);
    return res.status(429).json({ error: 'locked', message: 'Conta temporariamente bloqueada por tentativas inválidas. Tente mais tarde.' });
  }

  const db = store.getDb();
  const admin = db.admins.find(a => a.username === uname);
  const ok = admin && verifyPassword(password || '', admin.passwordHash);

  if (!ok) {
    registerFail(uname);
    store.addAudit('login_fail', 'usuário: ' + (uname || '(vazio)'), ip);
    await sleep(350 + Math.floor(Math.random() * 250)); // atrasa bruteforce
    return res.status(401).json({ error: 'bad_credentials', message: 'Usuário ou senha inválidos.' });
  }

  loginLocks.delete(uname);
  store.addAudit('login_ok', admin.role + ': ' + admin.username, ip);

  const token = store.createAdminSession(admin);
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === '1' || req.secure,
    path: '/',
    maxAge: 12 * 3600 * 1000
  });
  res.json({
    ok: true,
    redirect: store.getSettings().adminPanelPath || '/admin',
    admin: { username: admin.username, role: admin.role, mustChange: !!admin.mustChange }
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  store.destroySession(getToken(req) || getCookie(req, ADMIN_COOKIE));
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const db = store.getDb();
  const admin = db.admins.find(a => a.id === req.adminId);
  if (!admin) return res.status(403).json({ error: 'forbidden' });
  res.json({ admin: { username: admin.username, role: admin.role || 'mod', mustChange: !!admin.mustChange } });
});

/* ---------- moderadores (somente dono) ---------- */

app.get('/api/admin/mods', requireAdmin, requireOwner, (req, res) => {
  const mods = store.getDb().admins.map(a => ({
    id: a.id,
    username: a.username,
    role: a.role || 'mod',
    createdAt: a.createdAt
  }));
  res.json({ admins: mods });
});

app.post('/api/admin/mods', requireAdmin, requireOwner, (req, res) => {
  const username = cleanStr(req.body && req.body.username, 40);
  const password = (req.body && req.body.password) || '';
  if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) {
    return res.status(400).json({ error: 'bad_request', message: 'Usuário inválido (3+ caracteres, letras/números).' });
  }
  const db = store.getDb();
  if (db.admins.some(a => a.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: 'bad_request', message: 'Esse usuário já existe.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'A senha precisa ter pelo menos 8 caracteres.' });
  }
  db.admins.push({
    id: store.id('adm'),
    username,
    passwordHash: hashPassword(password),
    role: 'mod',
    createdAt: new Date().toISOString(),
    mustChange: false
  });
  store.persistNow();
  store.addAudit('mod_created', username, req.ip);
  res.json({ ok: true });
});

app.delete('/api/admin/mods/:id', requireAdmin, requireOwner, (req, res) => {
  const db = store.getDb();
  const target = db.admins.find(a => a.id === req.params.id);
  if (!target) return res.status(404).json({ error: 'not_found' });
  if (target.role === 'owner') {
    return res.status(400).json({ error: 'bad_request', message: 'O dono não pode ser removido.' });
  }
  // encerra sessões do moderador removido
  store.getDb().sessions = store.getDb().sessions.filter(s => s.adminId !== target.id);
  db.admins = db.admins.filter(a => a.id !== target.id);
  store.persistNow();
  store.addAudit('mod_deleted', target.username, req.ip);
  res.json({ ok: true });
});

/* ---------- segurança / auditoria (somente dono) ---------- */

app.get('/api/admin/security', requireAdmin, requireOwner, (req, res) => {
  const d = store.getDb();
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  res.json({
    failedLogins24h: d.auditLog.filter(a => a.action === 'login_fail' && new Date(a.at).getTime() > dayAgo).length,
    lockedEvents24h: d.auditLog.filter(a => a.action === 'login_locked' && new Date(a.at).getTime() > dayAgo).length,
    events: store.listAudit(60)
  });
});

app.post('/api/admin/change-password', requireAdmin, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  const db = store.getDb();
  const admin = db.admins.find(a => a.id === req.adminId);
  if (!admin || !verifyPassword(currentPassword || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Senha atual incorreta.' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'weak_password', message: 'A nova senha precisa ter pelo menos 8 caracteres.' });
  }
  admin.passwordHash = hashPassword(newPassword);
  admin.mustChange = false;
  store.persistNow();
  // por segurança, derruba todas as outras sessões desta conta
  const t = getToken(req) || getCookie(req, ADMIN_COOKIE);
  store.getDb().sessions = store.getDb().sessions.filter(s => s.isAdmin === false || s.adminId !== admin.id || s.token === t);
  store.persistNow();
  store.addAudit('password_changed', admin.username, req.ip);
  res.json({ ok: true });
});

app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const db = store.getDb();
  const activeKeys = db.keys.filter(k => k.status === 'ativa' && !store.isKeyExpired(k)).length;
  const expiredKeys = db.keys.filter(k => k.status === 'expirada' || store.isKeyExpired(k)).length;
  res.json({
    users: db.users.length,
    vipUsers: db.users.filter(u => u.isVip).length,
    activeKeys,
    expiredKeys,
    generationsToday: db.generations.filter(g => g.at.slice(0, 10) === new Date().toISOString().slice(0, 10)).length
  });
});

function publicKey(k) {
  return {
    id: k.id, code: k.code, status: k.status,
    createdAt: k.createdAt, expiresAt: k.expiresAt,
    maxUses: k.maxUses, uses: k.uses,
    activatedByLabel: k.activatedByLabel || null, activatedAt: k.activatedAt
  };
}

app.get('/api/admin/keys', requireAdmin, (req, res) => {
  const keys = [...store.getDb().keys]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(k => {
      const p = publicKey(k);
      p.expired = store.isKeyExpired(k);
      p.usesLeft = store.keyUsesLeft(k) === Infinity ? null : store.keyUsesLeft(k);
      return p;
    });
  res.json({ keys });
});

app.post('/api/admin/keys', requireAdmin, (req, res) => {
  const b = req.body || {};
  let ms = 0;
  const days = parseInt(b.expiresInDays, 10);
  if (Number.isInteger(days) && days > 0) ms += days * 24 * 3600 * 1000;
  const hours = parseInt(b.expiresInHours, 10);
  if (Number.isInteger(hours) && hours > 0) ms += hours * 3600 * 1000;
  const minutes = parseInt(b.expiresInMinutes, 10);
  if (Number.isInteger(minutes) && minutes > 0) ms += minutes * 60 * 1000;
  const seconds = parseInt(b.expiresInSeconds, 10);
  if (Number.isInteger(seconds) && seconds > 0) ms += seconds * 1000;
  const expiresAt = ms > 0 ? new Date(Date.now() + ms).toISOString() : null;
  let maxUses = 1;
  if (b.maxUses !== undefined && b.maxUses !== null && b.maxUses !== '') {
    const n = parseInt(b.maxUses, 10);
    maxUses = Number.isInteger(n) && n > 0 ? n : 0;
  }
  const key = store.createKey({ expiresAt, maxUses });
  store.addAudit('key_created', key.code.slice(0, 10) + '…', req.ip);
  res.json({ key: publicKey(key) });
});

app.patch('/api/admin/keys/:id', requireAdmin, (req, res) => {
  const key = store.getDb().keys.find(k => k.id === req.params.id);
  if (!key) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (b.status === 'ativa' || b.status === 'inativa') key.status = b.status;
  if ('expiresAt' in b) {
    if (b.expiresAt === null || b.expiresAt === '') key.expiresAt = null;
    else {
      const d = new Date(b.expiresAt);
      if (!isNaN(d.getTime())) key.expiresAt = d.toISOString();
    }
  }
  if ('maxUses' in b) {
    const n = parseInt(b.maxUses, 10);
    key.maxUses = Number.isInteger(n) && n > 0 ? n : 0;
  }
  store.saveKey(key);
  const p = publicKey(key);
  p.expired = store.isKeyExpired(key);
  p.usesLeft = store.keyUsesLeft(key) === Infinity ? null : store.keyUsesLeft(key);
  res.json({ key: p });
});

app.delete('/api/admin/keys/:id', requireAdmin, (req, res) => {
  const k = store.getDb().keys.find(x => x.id === req.params.id);
  const ok = store.deleteKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
  store.addAudit('key_deleted', k ? k.code.slice(0, 10) + '…' : req.params.id, req.ip);
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  const users = [...store.getDb().users]
    .sort((a, b) => (b.vipSince || b.createdAt).localeCompare(a.vipSince || a.createdAt))
    .map(u => ({
      id: u.id,
      label: u.label,
      isVip: !!u.isVip,
      vipSource: u.vipSource,
      vipSince: u.vipSince,
      createdAt: u.createdAt,
      lastSeenAt: u.lastSeenAt,
      deviceIdMasked: u.deviceId.slice(0, 8) + '…'
    }));
  res.json({ users });
});

app.patch('/api/admin/users/:id', requireAdmin, (req, res) => {
  const user = store.findUserById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  if (typeof b.isVip === 'boolean') {
    store.setUserVip(user, b.isVip, 'admin', null);
    store.addAudit(b.isVip ? 'vip_granted' : 'vip_removed', user.label, req.ip);
  }
  res.json({ user: { id: user.id, label: user.label, isVip: user.isVip, vipSource: user.vipSource } });
});

app.get('/api/admin/settings', requireAdmin, requireOwner, (req, res) => {
  const s = store.getSettings();
  res.json({ contactLink: s.contactLink, freeDailyLimit: s.freeDailyLimit, adminPanelPath: s.adminPanelPath || '/admin' });
});

app.put('/api/admin/settings', requireAdmin, requireOwner, (req, res) => {
  const oldPath = store.getSettings().adminPanelPath;
  const s = store.updateSettings(req.body || {});
  if (s.adminPanelPath !== oldPath) {
    store.addAudit('panel_path_changed', oldPath + ' → ' + s.adminPanelPath, req.ip);
  }
  res.json({ contactLink: s.contactLink, freeDailyLimit: s.freeDailyLimit, adminPanelPath: s.adminPanelPath });
});

/* ================= estáticos ================= */

/* Endereço secreto do painel: gerado no primeiro boot, configurável pelo dono */
function ensurePanelPath() {
  const s = store.getSettings();
  if (!s.adminPanelPath) {
    s.adminPanelPath = '/painel-' + crypto.randomBytes(4).toString('hex');
    store.persistNow();
  }
  return s.adminPanelPath;
}

app.use(express.static(path.join(__dirname, 'public')));

// O painel só existe no endereço secreto. Qualquer outra rota (como /admin)
// cai no 404 normal do site — para o visitante, o painel "não existe".
app.use((req, res, next) => {
  const panelPath = store.getSettings().adminPanelPath || '/admin';
  if (req.path !== panelPath) return next();
  const sess = findValidAdminSession(req);
  if (sess && sess.isAdmin) {
    return res.sendFile(path.join(__dirname, 'views', 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'views', 'admin-login.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  res.status(404).send('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>404</title></head><body style="background:#000103;color:#9ca3af;font-family:sans-serif;text-align:center;padding-top:18vh"><h1 style="color:#f3f4f6">404</h1><p>Página não encontrada.</p><p><a href="/" style="color:#38bdf8">Voltar ao início</a></p></body></html>');
});

app.use((err, req, res, next) => {
  console.error('[server]', err.message);
  res.status(500).json({ error: 'internal', message: 'Erro interno do servidor.' });
});

/* ================= start ================= */

store.load();
ensureDefaultAdmin();
const PANEL_PATH = ensurePanelPath();

/* Garante que nada se perca quando o servidor é fechado/reiniciado */
function gracefulShutdown() {
  try { store.persistNow(); } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('beforeExit', gracefulShutdown);

// limpeza periódica de sessões vencidas
store.pruneSessions();
setInterval(() => store.pruneSessions(), 3600 * 1000).unref();

app.listen(PORT, () => {
  console.log(`SENSI PRO rodando em http://localhost:${PORT}`);
  console.log('==============================================================');
  console.log('  PAINEL ADMIN (endereço secreto): ' + PANEL_PATH);
  console.log('  Abra: http://localhost:' + PORT + PANEL_PATH);
  console.log('  /admin comum retorna 404 de propósito.');
  console.log('  Você pode mudar esse endereço no painel, em Configurações.');
  console.log('==============================================================');
});

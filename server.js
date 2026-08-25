'use strict';

const path = require('path');
const crypto = require('crypto');
const express = require('express');

const store = require('./src/store');
const engine = require('./src/engine');
const devices = require('./src/devices');

const app = express();
const PORT = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));

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

function requireAdmin(req, res, next) {
  const sess = store.findSession(getToken(req));
  if (!sess || !sess.isAdmin) {
    return res.status(403).json({ error: 'forbidden', message: 'Acesso restrito a administradores.' });
  }
  req.adminId = sess.adminId;
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

function ensureDefaultAdmin() {
  const db = store.getDb();
  if (db.admins.length === 0) {
    const pass = process.env.ADMIN_PASSWORD || 'sensi-admin-2026';
    db.admins.push({
      id: store.id('adm'),
      username: process.env.ADMIN_USERNAME || 'admin',
      passwordHash: hashPassword(pass),
      createdAt: new Date().toISOString(),
      mustChange: !process.env.ADMIN_PASSWORD
    });
    store.persistNow();
    console.log('==============================================================');
    console.log('  ADMIN criado -> usuário: admin | senha: ' + pass);
    console.log('  (definida pela env ADMIN_PASSWORD ou padrão acima)');
    console.log('  Troque a senha no painel administrativo após o primeiro acesso.');
    console.log('==============================================================');
  }
}

app.post('/api/admin/login', adminLoginLimiter, (req, res) => {
  const { username, password } = req.body || {};
  const db = store.getDb();
  const admin = db.admins.find(a => a.username === cleanStr(username, 40));
  if (!admin || !verifyPassword(password || '', admin.passwordHash)) {
    return res.status(401).json({ error: 'bad_credentials', message: 'Usuário ou senha inválidos.' });
  }
  const token = store.createAdminSession(admin);
  res.json({
    token,
    admin: { username: admin.username, mustChange: !!admin.mustChange }
  });
});

app.post('/api/admin/logout', requireAdmin, (req, res) => {
  store.destroySession(getToken(req));
  res.json({ ok: true });
});

app.get('/api/admin/me', requireAdmin, (req, res) => {
  const db = store.getDb();
  const admin = db.admins.find(a => a.id === req.adminId);
  res.json({ admin: { username: admin ? admin.username : '?', mustChange: !!(admin && admin.mustChange) } });
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
  const expiresAt = ms > 0 ? new Date(Date.now() + ms).toISOString() : null;
  let maxUses = 1;
  if (b.maxUses !== undefined && b.maxUses !== null && b.maxUses !== '') {
    const n = parseInt(b.maxUses, 10);
    maxUses = Number.isInteger(n) && n > 0 ? n : 0;
  }
  const key = store.createKey({ expiresAt, maxUses });
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
  const ok = store.deleteKey(req.params.id);
  if (!ok) return res.status(404).json({ error: 'not_found' });
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
  }
  res.json({ user: { id: user.id, label: user.label, isVip: user.isVip, vipSource: user.vipSource } });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  const s = store.getSettings();
  res.json({ contactLink: s.contactLink, freeDailyLimit: s.freeDailyLimit });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const s = store.updateSettings(req.body || {});
  res.json({ contactLink: s.contactLink, freeDailyLimit: s.freeDailyLimit });
});

/* ================= estáticos ================= */

app.use(express.static(path.join(__dirname, 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'not_found' });
  }
  next();
});

app.use((err, req, res, next) => {
  console.error('[server]', err.message);
  res.status(500).json({ error: 'internal', message: 'Erro interno do servidor.' });
});

/* ================= start ================= */

store.load();
ensureDefaultAdmin();

app.listen(PORT, () => {
  console.log(`SENSI PRO rodando em http://localhost:${PORT}`);
});

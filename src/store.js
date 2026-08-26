'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ============ persistência ============
 * Dois modos, escolhidos automaticamente:
 *  - MONGODB_URI definido -> banco de dados MongoDB Atlas (produção: nada se perde)
 *  - sem MONGODB_URI      -> arquivo local data/db.json (modo PC/dev)
 * O resto do código não muda: tudo continua lendo/escrevendo em `db`.
 */

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

let mongoClient = null;
let mongoCol = null;
let mongoWrite = null; // promessa do último save em andamento

const DEFAULT_DB = {
  meta: { createdAt: new Date().toISOString() },
  admins: [],
  users: [],
  keys: [],
  sessions: [],
  generations: [],
  profiles: [],
  auditLog: [],
  settings: {
    contactLink: '',
    freeDailyLimit: 3
  }
};

let db = null;
let saveTimer = null;

/* ---------- MongoDB (opcional) ---------- */
async function connectMongo() {
  const uri = process.env.MONGODB_URI;
  if (!uri) return;
  try {
    const { MongoClient } = require('mongodb');
    mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
    await mongoClient.connect();
    mongoCol = mongoClient.db('sensipro').collection('db');
    console.log('[store] Conectado ao MongoDB Atlas — dados persistentes ✔');
  } catch (e) {
    console.error('[store] FALHA ao conectar no MongoDB:', e.message);
    mongoClient = null;
    mongoCol = null;
  }
}

async function loadFromMongo() {
  const doc = await mongoCol.findOne({ _id: 'db' });
  if (doc && doc.data) return doc.data;
  return null;
}

function saveToMongoNow() {
  if (!mongoCol) return Promise.resolve();
  mongoWrite = mongoCol.updateOne(
    { _id: 'db' },
    { $set: { data: db, savedAt: new Date().toISOString() } },
    { upsert: true }
  ).catch(e => console.error('[store] erro ao salvar no Mongo:', e.message));
  return mongoWrite;
}

/* ---------- inicialização ---------- */
async function init() {
  await connectMongo();
  if (mongoCol) {
    let data = null;
    try { data = await loadFromMongo(); }
    catch (e) { console.error('[store] erro ao ler Mongo:', e.message); }
    if (data) {
      db = Object.assign(structuredClone(DEFAULT_DB), data);
      for (const k of Object.keys(DEFAULT_DB)) {
        if (db[k] === undefined) db[k] = structuredClone(DEFAULT_DB[k]);
      }
      console.log('[store] Banco carregado do MongoDB (' +
        (db.users ? db.users.length : 0) + ' usuários, ' +
        (db.keys ? db.keys.length : 0) + ' keys)');
      return db;
    }
    // primeira vez no banco: tenta aproveitar um db.json existente
    db = structuredClone(DEFAULT_DB);
    if (fs.existsSync(DB_FILE)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        db = Object.assign(structuredClone(DEFAULT_DB), parsed);
        for (const k of Object.keys(DEFAULT_DB)) {
          if (db[k] === undefined) db[k] = structuredClone(DEFAULT_DB[k]);
        }
        console.log('[store] db.json local migrado para o MongoDB ✔');
      } catch (_) {}
    }
    await saveToMongoNow();
    return db;
  }

  // modo arquivo (PC/dev)
  load();
  return db;
}

function load() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(DB_FILE)) {
    try {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      db = Object.assign({}, structuredClone(DEFAULT_DB), parsed);
      for (const k of Object.keys(DEFAULT_DB)) {
        if (db[k] === undefined) db[k] = structuredClone(DEFAULT_DB[k]);
      }
      return db;
    } catch (e) {
      console.error('[store] db.json corrompido, recriando backup...');
      try { fs.copyFileSync(DB_FILE, DB_FILE + '.corrupt-' + Date.now()); } catch (_) {}
    }
  }
  db = structuredClone(DEFAULT_DB);
  persistNow();
  return db;
}

function persistNow() {
  if (mongoCol) {
    saveToMongoNow();
    return;
  }
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { persistNow(); } catch (e) { console.error('[store] falha ao salvar:', e.message); }
  }, 120);
}

/* desligamento: garante que o último estado vá pro banco/arquivo */
async function shutdown() {
  try { persistNow(); } catch (_) {}
  if (mongoWrite) { try { await Promise.race([mongoWrite, new Promise(r => setTimeout(r, 800))]); } catch (_) {} }
  if (mongoClient) { try { await mongoClient.close(); } catch (_) {} }
}

function getDb() {
  if (!db) load();
  return db;
}

function id(prefix) {
  return prefix + '_' + crypto.randomBytes(9).toString('hex');
}

/* ---------- usuários ---------- */
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
function setUserVip(user, isVip, source, keyId) {
  user.isVip = !!isVip;
  user.vipSource = isVip ? (source || 'admin') : null;
  user.vipKeyId = isVip ? (keyId || null) : null;
  user.vipSince = isVip ? new Date().toISOString() : null;
  persistNow();
}

/* ---------- sessões ---------- */
const USER_SESSION_TTL_MS = 30 * 24 * 3600 * 1000;   // 30 dias
const ADMIN_SESSION_TTL_MS = 12 * 3600 * 1000;       // 12 horas

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
  // sessão sem validade (legado) ou vencida é descartada na hora
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

/* ---------- auditoria de segurança ---------- */
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

/* ---------- keys ---------- */
function findKeyByCode(code) {
  const norm = normalizeKey(code);
  return getDb().keys.find(k => k.code === norm) || null;
}
function normalizeKey(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}
function createKey({ expiresAt = null, maxUses = 1 }) {
  const code = generateKeyCode();
  const key = {
    id: id('key'),
    code,
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
function generateKeyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () => Array.from(crypto.randomBytes(4)).map(b => alphabet[b % alphabet.length]).join('');
  let code, tries = 0;
  do {
    code = `SENSI-${block()}-${block()}-${block()}`;
    tries++;
  } while (findKeyByCode(code) && tries < 50);
  return code;
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

/* ---------- gerações / histórico ---------- */
function addGeneration(entry) {
  const g = Object.assign({ id: id('gen'), at: new Date().toISOString() }, entry);
  getDb().generations.push(g);
  scheduleSave();
  return g;
}
function countFreeToday(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return getDb().generations.filter(g =>
    g.userId === userId && ['normal', 'free', 'iphone'].includes(g.mode) && g.at.slice(0, 10) === today
  ).length;
}
function listHistory(userId, limit = 100) {
  return getDb().generations
    .filter(g => g.userId === userId)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, limit);
}

/* ---------- perfis salvos ---------- */
function listProfiles(userId) {
  return getDb().profiles.filter(p => p.userId === userId).sort((a, b) => b.at.localeCompare(a.at));
}
function addProfile(userId, name, inputs) {
  const p = { id: id('prf'), userId, name: String(name).slice(0, 40), inputs, at: new Date().toISOString() };
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

/* ---------- settings ---------- */
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
    if (!v || /^\/[a-z0-9_-]{2,60}(\/[a-z0-9_-]{1,60})*$/.test(v)) {
      s.adminPanelPath = v || '/admin';
    }
  }
  persistNow();
  return s;
}

module.exports = {
  getDb, load, persistNow, init, shutdown,
  id,
  findUserByDevice, findUserById, createUser, touchUser, setUserVip,
  createSession, createAdminSession, findSession, destroySession, pruneSessions,
  findKeyByCode, normalizeKey, createKey, saveKey, deleteKey, isKeyExpired, keyUsesLeft,
  addGeneration, countFreeToday, listHistory,
  listProfiles, addProfile, deleteProfile,
  getSettings, updateSettings,
  addAudit, listAudit
};

'use strict';


require('dotenv').config({ quiet: true });


const path = require('path');

const crypto = require('crypto');

const express = require('express');



const store = require('./src/store');

const engine = require('./src/engine');

const devices = require('./src/devices');

const email = require('./src/email');

const emailScheduler = require('./src/email-scheduler');


const app = express();

const PORT = process.env.PORT || 3000;

const ADMIN_PANEL_PATH = '/painel-admin';



// Necessário para o rate limiting funcionar certo atrás de hospedagens
// como Render/Railway/Vercel etc.
app.set('trust proxy', 1);


app.disable('x-powered-by');

app.use(express.json({ limit: '32kb' }));


/* ================= headers de segurança ================= */

app.use((req, res, next) => {

  res.setHeader('X-Content-Type-Options', 'nosniff');

  res.setHeader('X-Frame-Options', 'DENY');

  res.setHeader('Referrer-Policy', 'no-referrer');


  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=()'
  );


  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src https://fonts.gstatic.com; " +
    "img-src 'self' data: https://i.ytimg.com; " +
    "connect-src 'self'; " +
    "frame-src https://www.youtube-nocookie.com; " +
    "frame-ancestors 'none'; " +
    "base-uri 'self'; " +
    "form-action 'self'; " +
    "object-src 'none'"
  );


  if (
    req.path.startsWith('/api/admin') ||
    req.path === ADMIN_PANEL_PATH
  ) {

    res.setHeader(
      'Cache-Control',
      'no-store, must-revalidate'
    );


    res.setHeader('Pragma', 'no-cache');

  }


  next();

});


/* ================= utilidades de segurança ================= */

function hashPassword(password, salt) {

  salt =
    salt ||
    crypto.randomBytes(16).toString('hex');


  const hash = crypto
    .scryptSync(String(password), salt, 64)
    .toString('hex');


  return `${salt}:${hash}`;

}


function verifyPassword(password, stored) {

  try {

    const [salt, hash] = String(stored).split(':');


    if (!salt || !hash) {

      return false;

    }


    const test = crypto
      .scryptSync(String(password), salt, 64)
      .toString('hex');


    const storedBuffer = Buffer.from(hash, 'hex');

    const testBuffer = Buffer.from(test, 'hex');


    if (storedBuffer.length !== testBuffer.length) {

      return false;

    }


    return crypto.timingSafeEqual(
      storedBuffer,
      testBuffer
    );

  } catch (_) {

    return false;

  }

}


function rateLimiter({ windowMs, max, message }) {

  const hits = new Map();


  setInterval(() => {

    const now = Date.now();


    for (const [key, arr] of hits) {

      const alive = arr.filter(
        timestamp => now - timestamp < windowMs
      );


      if (alive.length === 0) {

        hits.delete(key);

      } else {

        hits.set(key, alive);

      }

    }

  }, windowMs).unref();


  return function limiter(req, res, next) {

    const ip =
      req.ip ||
      req.connection.remoteAddress ||
      '?';


    const now = Date.now();


    const arr = (
      hits.get(ip) || []
    ).filter(
      timestamp => now - timestamp < windowMs
    );


    if (arr.length >= max) {

      return res.status(429).json({

        error: 'rate_limit',
        message
      });

    }


    arr.push(now);

    hits.set(ip, arr);


    next();

  };

}


function cleanStr(value, maxLen = 120) {

  if (typeof value !== 'string') {

    return '';

  }


  return value.trim().slice(0, maxLen);

}


/* Duração->ms a partir do plano escolhido (ex: '1h','7d','permanent','30 dias').
 * 'permanent' / nulo => sem expiração (null). */
function msFromDuration(duration) {

  if (!duration) return null;

  const s = String(duration).toLowerCase().trim();

  if (!s || s.includes('perm') || s === 'eterno' || s === 'vitalicio') return null;

  const m = s.match(/(\d+)\s*(h|horas?|d|dias?|semana?s?|meses?|anos?)/);

  if (!m) return null;

  const n = Number(m[1]);

  const u = m[2];

  if (u === 'h' || u.startsWith('hor')) return n * 36e5;

  if (u.startsWith('d') || u.startsWith('sem')) return n * 864e5;

  if (u.startsWith('mes')) return n * 30 * 864e5;

  if (u.startsWith('ano')) return n * 365 * 864e5;

  return null;

}


/* ms de validade do plano: key de preço fixo (ex '1h','7d') ou plano custom. */
function msFromPlan(plan) {

  if (!plan || plan === 'permanent') return null;

  const fixed = msFromDuration(plan);

  if (fixed != null) return fixed;

  // plano custom: busca a duração no catálogo de planos
  const match = store.listPlans().find(p =>
    p && (p.id === plan || p.name === plan || p.id === ('plan_' + plan))
  );

  if (match) {

    const d = msFromDuration(match.duration || match.plan || '');

    if (d != null) return d;

  }

  // fallback: tenta interpretar o próprio nome como duração
  return msFromDuration(plan);

}


function getToken(req) {

  const header =
    req.headers['authorization'] || '';


  const match =
    header.match(/^Bearer\s+(.+)$/i);


  return match
    ? match[1].trim()
    : null;

}


function getCookie(req, name) {

  const header =
    req.headers.cookie || '';


  const match = header.match(
    new RegExp(
      '(?:^|;\\s*)' +
      name +
      '=([^;]*)'
    )
  );


  return match
    ? decodeURIComponent(match[1])
    : null;

}


function currentUser(req) {

  const session =
    store.findSession(getToken(req));


  if (!session || session.isAdmin) {

    return null;

  }


  const user =
    store.findUserById(session.userId);


  if (!user) {

    return null;

  }


  refreshUserVip(user);


  return user;

}


/* Revalida o VIP do usuário */

function refreshUserVip(user) {

  if (
    !user.isVip ||
    user.vipSource !== 'key'
  ) {

    return user;

  }


  const key =
    store.getDb().keys.find(
      k => k.id === user.vipKeyId
    );


  if (
    !key ||
    (key.status !== 'ativa' && key.status !== 'aguardando') ||
    store.isKeyExpired(key)
  ) {

    store.setUserVip(
      user,
      false
    );


    user._vipRevoked = true;

  }


  return user;

}


function vipExpiresAtOf(user) {

  if (
    !user.isVip ||
    user.vipSource !== 'key'
  ) {

    return null;

  }


  const key =
    store.getDb().keys.find(
      k => k.id === user.vipKeyId
    );


  return key && key.expiresAt
    ? key.expiresAt
    : null;

}


function vipTypeOf(user) {

  if (!user || !user.isVip) {

    return null;

  }


  // Em bancos antigos, users.vip_type pode não existir. A KEY é a fonte
  // confiável do plano e mantém o acesso certo ao entrar em outro celular.
  if (user.vipSource === 'key' && user.vipKeyId) {

    const key = store.getDb().keys.find(k => k.id === user.vipKeyId);

    if (key) {

      return store.canonicalKeyType(key.type);

    }

  }


  return user.vipType
    ? store.canonicalKeyType(user.vipType)
    : null;

}


function requireUser(req, res, next) {

  const user = currentUser(req);


  if (!user) {

    return res.status(401).json({

      error: 'unauthorized',
      message:
        'Sessão expirada. Recarregue a página.'
    });

  }


  req.user = user;


  store.touchUser(user);

  next();

}


function requireUserAuth(req, res, next) {

  return requireUser(req, res, next);

}


function requireVip(req, res, next) {
  requireUser(req, res, () => {

    if (!req.user.isVip) {

      return res.status(403).json({

        error: 'vip_required',
        upsell: true,
        title: 'Recurso VIP',
        message:
          'Desbloqueie configurações avançadas e mais personalização.'
      });

    }


    next();

  });

}


const ADMIN_COOKIE = 'sensi_admin';


function findValidAdminSession(req) {

  const token =
    getToken(req) ||
    getCookie(req, ADMIN_COOKIE);


  const session =
    store.findSession(token);


  if (
    !session ||
    !session.isAdmin
  ) {

    return null;

  }


  return session;

}


function requireAdmin(req, res, next) {

  const session =
    findValidAdminSession(req);


  if (!session) {

    return res.status(403).json({

      error: 'forbidden',
      message:
        'Acesso restrito a administradores.'
    });

  }


  req.adminId = session.adminId;


  next();

}


function requireOwner(req, res, next) {

  const admin =
    store.getDb().admins.find(
      a => a.id === req.adminId
    );


  if (
    !admin ||
    admin.role !== 'owner'
  ) {

    return res.status(403).json({

      error: 'forbidden',
      message:
        'Apenas o dono pode fazer isso.'
    });

  }


  next();

}


/* ================= sessão / usuário ================= */

app.post(
  '/api/session/init',
  (req, res) => {

    const deviceId = cleanStr(
      req.body &&
      req.body.deviceId,
      64
    );


    if (
      !deviceId ||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(deviceId)
    ) {

      return res.status(400).json({

        error: 'bad_request',
        message:
          'Identificador de dispositivo inválido.'
      });

    }


    const incomingName = cleanStr(
      req.body &&
      req.body.name,
      40
    );


    let user =
      store.findUserByDevice(deviceId);


    if (!user) {

      user =
        store.createUser(deviceId);

    }


    if (
      incomingName &&
      (!user.label ||
        user.label.startsWith('Jogador #'))
    ) {

      user.label = incomingName;

      store.persistNow();

    }


    refreshUserVip(user);


    const token =
      store.createSession(user);


    res.json({

      token,
      user: {

        id: user.id,
        label: user.label,
        isVip: !!user.isVip,
        vipType: vipTypeOf(user),
        vipExpiresAt:
          vipExpiresAtOf(user)
      },
      settings: {

        contactLink:
          store.getSettings()
            .contactLink || ''
      }

    });

  }

);


app.get(
  '/api/me',
  (req, res) => {

    const user =
      currentUser(req);


    if (!user) {

      return res.status(401).json({

        error: 'unauthorized'
      });

    }


    res.json({

      user: {

        id: user.id,
        label: user.label,
        isVip: !!user.isVip,
        vipType: vipTypeOf(user),
        vipExpiresAt:
          vipExpiresAtOf(user)
      }

    });

  }

);


app.put(
  '/api/me/name',
  requireUser,
  (req, res) => {

    const name = cleanStr(
      req.body &&
      req.body.name,
      40
    );


    if (!name) {

      return res.status(400).json({

        error: 'bad_request',
        message:
          'Informe um nome válido.'
      });

    }


    req.user.label = name;


    store.persistNow();


    res.json({

      ok: true,
      user: {

        id: req.user.id,
        label: req.user.label,
        isVip: !!req.user.isVip,
        vipType: vipTypeOf(req.user),
        vipExpiresAt: vipExpiresAtOf(req.user)
      }

    });

  }

);


app.post(
  '/api/session/logout',
  (req, res) => {

    const token =
      getToken(req);


    if (token) {

      store.destroySession(token);

    }


    res.json({

      ok: true
    });

  }

);


/* ================= contas (e-mail / senha) ================= */

const authLimiter = rateLimiter({

  windowMs: 15 * 60 * 1000,
  max: 12,
  message:
    'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
});


function validEmail(email) {

  return (
    typeof email === 'string' &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
  );

}


function accountUserById(userId) {

  return store.findUserById(userId);

}


app.post(
  '/api/auth/register',
  authLimiter,
  (req, res) => {

    const email = cleanStr(req.body && req.body.email, 120).toLowerCase();

    const password = (req.body && req.body.password) || '';

    const name = cleanStr(req.body && req.body.name, 40);


    if (!validEmail(email)) {

      return res.status(400).json({

        error: 'bad_request',
        message: 'Informe um e-mail válido.'
      });

    }


    if (typeof password !== 'string' || password.length < 8) {

      return res.status(400).json({

        error: 'weak_password',
        message: 'A senha precisa ter pelo menos 8 caracteres.'
      });

    }


    if (store.findAccountByEmail(email)) {

      return res.status(400).json({

        error: 'email_in_use',
        message: 'Este e-mail já está cadastrado.'
      });

    }


    // se já existe sessão de dispositivo válida, vincula a conta a esse
    // usuário (mantém VIP, histórico e perfis)
    let user = currentUser(req);


    if (!user) {

      const deviceId = 'acct' + crypto.randomBytes(12).toString('hex');

      user = store.createUser(deviceId);

    }


    if (name) {

      user.label = name;

      store.persistNow();

    }


    const account = store.createAccount({

      email,
      passwordHash: hashPassword(password),
      userId: user.id
    });


    store.addAudit('account_created', email, req.ip);


    const token = store.createSession(user);


    res.json({

      token,
      user: {

        id: user.id,
        label: user.label,
        isVip: !!user.isVip,
        vipType: vipTypeOf(user),
        vipExpiresAt: vipExpiresAtOf(user)
      },
      account: { email: account.email }

    });

  }

);


app.post(
  '/api/auth/login',
  authLimiter,
  async (req, res) => {

    const email = cleanStr(req.body && req.body.email, 120).toLowerCase();

    const password = (req.body && req.body.password) || '';


    const account = store.findAccountByEmail(email);

    const ok = account && verifyPassword(password, account.passwordHash);


    if (!ok) {

      await sleep(350 + Math.floor(Math.random() * 250));


      return res.status(401).json({

        error: 'bad_credentials',
        message: 'E-mail ou senha inválidos.'
      });

    }


    let user = account.userId ? accountUserById(account.userId) : null;


    if (!user) {

      const deviceId = 'acct' + crypto.randomBytes(12).toString('hex');

      user = store.createUser(deviceId);

      account.userId = user.id;

      store.saveAccount(account);

    }


    refreshUserVip(user);


    const token = store.createSession(user);


    res.json({

      token,
      user: {

        id: user.id,
        label: user.label,
        isVip: !!user.isVip,
        vipType: vipTypeOf(user),
        vipExpiresAt: vipExpiresAtOf(user)
      },
      account: { email: account.email }

    });

  }

);


app.get(
  '/api/auth/me',
  requireUser,
  (req, res) => {

    const account = store.findAccountByUserId(req.user.id);


    res.json({

      user: {

        id: req.user.id,
        label: req.user.label,
        isVip: !!req.user.isVip,
        vipType: vipTypeOf(req.user),
        vipExpiresAt: vipExpiresAtOf(req.user)
      },
      account: account ? { email: account.email } : null
    });

  }

);


app.post(
  '/api/auth/logout',
  (req, res) => {

    const token = getToken(req);


    if (token) {

      store.destroySession(token);

    }


    res.json({ ok: true });

  }

);


app.post(
  '/api/auth/change-password',
  requireUser,
  (req, res) => {

    const { currentPassword, newPassword } = req.body || {};


    const account = store.findAccountByUserId(req.user.id);


    if (!account) {

      return res.status(400).json({

        error: 'no_account',
        message: 'Sua sessão não possui conta de e-mail vinculada.'
      });

    }


    if (!verifyPassword(currentPassword || '', account.passwordHash)) {

      return res.status(401).json({

        error: 'bad_credentials',
        message: 'Senha atual incorreta.'
      });

    }


    if (typeof newPassword !== 'string' || newPassword.length < 8) {

      return res.status(400).json({

        error: 'weak_password',
        message: 'A nova senha precisa ter pelo menos 8 caracteres.'
      });

    }


    account.passwordHash = hashPassword(newPassword);

    store.saveAccount(account);

    store.addAudit('account_password_changed', account.email, req.ip);


    res.json({ ok: true });

  }

);


/* ================= informações públicas ================= */

app.get(
  '/api/settings/public',
  (req, res) => {

    const settings =
      store.getSettings();


    res.json({

      contactLink:
        settings.contactLink || '',
      freeDailyLimit:
        settings.freeDailyLimit
    });

  }

);


app.get(
  '/api/devices/names',
  (req, res) => {

    res.json({

      devices:
        devices.deviceNames()
    });

  }

);


/* ================= ativação de KEY ================= */

const keyLimiter = rateLimiter({

  windowMs: 10 * 60 * 1000,
  max: 8,
  message:
    'Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.'
});


const saleStatusLimiter = rateLimiter({

  windowMs: 5 * 60 * 1000,
  max: 20,
  message: 'Muitas consultas. Tente novamente em instantes.'
});


app.post(
  '/api/key/activate',
  keyLimiter,
  requireUser,
  (req, res) => {

    const code = cleanStr(
      req.body &&
      req.body.key,
      32
    );


    if (!code) {

      return res.status(400).json({

        status: 'invalid',
        message:
          '❌ KEY inválida ou expirada.'
      });

    }


    const key =
      store.findKeyByCode(code);


    if (
      !key ||
      (key.status !== 'ativa' && key.status !== 'aguardando')
    ) {

      return res.json({

        status: 'invalid',
        message:
          '❌ KEY inválida ou expirada.'
      });

    }


    if (store.isKeyExpired(key)) {

      key.status = 'expirada';


      store.saveKey(key);


      return res.json({

        status: 'expired',
        message:
          '⏰ Esta KEY expirou.'
      });

    }


    if (
      store.keyUsesLeft(key) <= 0 &&
      key.activatedByUserId !==
      req.user.id
    ) {

      return res.json({

        status: 'exhausted',
        message:
          '⚠️ Esta KEY não possui mais usos disponíveis.'
      });

    }


    const keyType =
      store.canonicalKeyType(key.type);


    // reativação da mesma KEY: só considera "ok" se o tipo ainda bate
    // (ativação de uma KEY de outro tipo deve trocar o acesso do usuário)
    if (
      key.activatedByUserId ===
      req.user.id &&
      req.user.isVip &&
      store.canonicalKeyType(req.user.vipType) === keyType
    ) {

      return res.json({

        status: 'ok',
        message:
          '✅ KEY ativada com sucesso!',
        user: {

          isVip: true,
          vipType: keyType,
          vipExpiresAt:
            vipExpiresAtOf(req.user)
        }

      });

    }


    // KEY 'aguardando' (vinda de venda aprovada): calcular expiresAt
    // AGORA com base na duração. O tempo só começa a contar a partir
    // deste momento em que o cliente está ativando a key no gerador.
    if (key.status === 'aguardando' || !key.expiresAt) {
      const ms = store.msFromKeyDuration ? store.msFromKeyDuration(key) : null;
      // fallback: tentar via msFromPlan se msFromKeyDuration não existir
      const durMs = ms != null ? ms : (typeof msFromPlan === 'function' ? msFromPlan(key.plan || key.duration || '') : null);
      key.expiresAt = durMs ? new Date(Date.now() + durMs).toISOString() : null;
      key.status = 'ativa';
    }

    key.uses += 1;

    key.activatedByUserId =
      req.user.id;

    key.activatedByLabel =
      req.user.label;

    key.activatedAt =
      new Date().toISOString();


    store.saveKey(key);


    store.setUserVip(
      req.user,
      true,
      'key',
      key.id,
      keyType
    );


    // mensagem: se a key foi ativada agora pela primeira vez, reforça
    // que o tempo começou a contar NESTE momento
    const wasAguardando = !key.activatedByUserId || key.activatedByUserId !== req.user.id;
    const successMsg = wasAguardando
      ? '✅ KEY ativada! O tempo começou a contar agora.'
      : '✅ KEY ativada com sucesso!';

    res.json({

      status: 'ok',
      message: successMsg,
      user: {

        isVip: true,
        vipType: keyType,
        vipExpiresAt:
          vipExpiresAtOf(req.user)
      }

    });

  }

);


/* ================= geração ================= */

function recordGen(
  user,
  mode,
  inputs,
  result
) {

  store.addGeneration({

    userId: user.id,
    mode,
    inputs,
    values: result.values,
    dpi: result.dpi,
    fireButton: result.fireButton,
    deviceName:
      result.deviceName || null,
    knownDevice:
      !!result.knownDevice
  });

}


/* ================= produtos públicos ================= */

app.get(
  '/api/products',
  (req, res) => {

    const products = store.listProducts()
      .filter(p => p.active)
      .map(p => ({

        id: p.id,
        name: p.name,
        description: p.description,
        plans: (p.plans || []).filter(pl => pl.active).map(pl => ({

          id: pl.id,
          name: pl.name,
          duration: pl.duration,
          price: pl.price
        }))
      }));

    res.json({ products });

  }

);


app.get(
  '/api/prices',
  (req, res) => {

    const settings = store.getSettings();

    res.json({

      prices: settings.prices || {},
      plans: (Array.isArray(settings.plans) ? settings.plans : [])
        .filter(p => p.active !== false)
        .map(p => ({ id: p.id, type: p.type, name: p.name, price: p.price }))
    });

  }

);


/* ---------- gerenciador de planos (admin) ---------- */

app.get(
  '/api/admin/plans',
  requireAdmin,
  (req, res) => {

    res.json({ plans: store.listPlans() });

  }

);


app.put(
  '/api/admin/plans',
  requireAdmin,
  (req, res) => {

    const incoming = (req.body && req.body.plans) || [];


    if (!Array.isArray(incoming)) {

      return res.status(400).json({ message: 'Dados inválidos.' });

    }


    const plans = incoming
      .map((p, i) => ({

        id: store.clean(p && p.id, 60) || 'plan_' + Date.now().toString(36) + '_' + i,
        type: store.canonicalKeyType(p && p.type),
        name: store.clean(p && p.name, 60),
        price: Math.max(0, Number(p && p.price) || 0),
        active: !!(p && p.active)
      }))
      .filter(p => p.name);


    // evita ids duplicados
    const seen = new Set();

    const unique = plans.filter(p => {

      if (seen.has(p.id)) return false;

      seen.add(p.id);

      return true;

    });


    store.setPlans(unique);

    store.addAudit('plans_updated', unique.length + ' plano(s) salvos', req.ip);


    res.json({ ok: true, plans: unique });

  }

);


app.put(
  '/api/admin/prices',
  requireAdmin,
  express.json(),
  (req, res) => {

    const { prices } = req.body || {};

    if (!prices || typeof prices !== 'object') {

      return res.status(400).json({ message: 'Dados inválidos.' });

    }

    const settings = store.getSettings();

    settings.prices = {

      premium: prices.premium || {},
      vip: prices.vip || {}

    };

    store.persistNow();

    store.addAudit('prices_updated', 'Preços atualizados');

    res.json({ ok: true, prices: settings.prices });

  }

);


app.get(
  '/api/settings',
  (req, res) => {

    const s = store.getSettings();

    res.json({

      settings: {

        contactLink: s.contactLink || '',
        announcement: s.announcement || null
      }

    });

  }

);


app.post(
  '/api/generate',
  requireUser,
  (req, res) => {

    const body =
      req.body || {};


    const tier =
      engine.TIERS.includes(
        body.tier
      )
        ? body.tier
        : 'normal';


    const deviceModel =
      cleanStr(
        body.deviceModel,
        60
      );


    if (!deviceModel) {

      return res.status(400).json({

        error: 'missing_model',
        message:
          'Informe o modelo do seu celular para continuar.'
      });

    }


    const inputs = {

      tier,
      deviceModel,
      dpiAtual: body.dpiAtual,
      style: body.style,
      level: body.level,
      aim: body.aim
    };


    const userKeyType = store.canonicalKeyType(req.user.vipType);


    if (tier !== 'normal' && !req.user.isVip) {

      return res.status(403).json({

        error: 'vip_required',
        upsell: true,
        title: 'Sensi ' + (tier === 'premium' ? 'Premium' : 'VIP'),
        message: 'Ative uma KEY para gerar a Sensi ' + (tier === 'premium' ? 'Premium' : 'VIP') + '.'
      });

    }


    // Separação estrita (spec §3): KEY Premium só libera Premium;

    // KEY Proibida só libera Proibida — nunca o contrário.
    if (tier === 'premium' && userKeyType !== 'premium') {

      return res.status(403).json({

        error: 'vip_required',
        upsell: true,
        title: 'Sensi Premium',
        message: '🔒 Sua KEY não possui acesso ao Premium.'
      });

    }


    if (tier === 'proibida' && userKeyType !== 'proibida') {

      return res.status(403).json({

        error: 'vip_required',
        upsell: true,
        title: 'Sensi VIP',
        message: '🔒 Este recurso exige uma KEY Proibida válida.'
      });

    }


    let remaining = null;

    let limit = null;


    if (
      tier === 'normal' &&
      !req.user.isVip
    ) {

      limit =
        store.getSettings()
          .freeDailyLimit;


      const used =
        store.countFreeToday(
          req.user.id
        );


      if (
        limit > 0 &&
        used >= limit
      ) {

        return res.status(429).json({

          error: 'daily_limit',
          message:
            `Você atingiu o limite de ${limit} gerações de hoje. Ative uma KEY VIP para gerar sem limites.`,
          used,
          limit
        });

      }


      remaining =
        Math.max(
          0,
          limit -
          (used + 1)
        );

    }


    const result =
      engine.generate(inputs);


    if (result.error) {

      return res.status(400).json({

        error: 'missing_model',
        message:
          result.message
      });

    }


    recordGen(
      req.user,
      tier,
      inputs,
      result
    );


    if (tier === 'normal') {

      if (req.user.isVip) {

        return res.json({

          ...result,
          remaining: null,
          unlimited: true
        });

      }


      return res.json({

        ...result,
        remaining,
        limit
      });

    }


    res.json(result);

  }

);


/* ================= gerador emulador (grátis) ================= */

app.post(
  '/api/generate/emulator',
  requireUser,
  (req, res) => {

    const body = req.body || {};


    const inputs = {

      emulator: cleanStr(body.emulator, 20),
      mouseDpi: body.mouseDpi,
      mouseSens: body.mouseSens,
      style: body.style
    };


    let remaining = null;

    let limit = null;


    if (!req.user.isVip) {

      limit =
        store.getSettings()
          .freeDailyLimit;


      const used =
        store.countFreeToday(
          req.user.id
        );


      if (
        limit > 0 &&
        used >= limit
      ) {

        return res.status(429).json({

          error: 'daily_limit',
          message:
            `Você atingiu o limite de ${limit} gerações de hoje. Ative uma KEY VIP para gerar sem limites.`,
          used,
          limit
        });

      }


      remaining =
        Math.max(
          0,
          limit -
          (used + 1)
        );

    }


    const result =
      engine.generateEmulator(inputs);


    recordGen(
      req.user,
      'emulador',
      inputs,
      result
    );


    if (req.user.isVip) {

      return res.json({

        ...result,
        remaining: null,
        unlimited: true
      });

    }


    res.json({

      ...result,
      remaining,
      limit
    });

  }

);


/* ================= histórico ================= */

app.get(
  '/api/history',
  requireVip,
  (req, res) => {

    res.json({

      history:
        store.listHistory(
          req.user.id,
          60
        )
    });

  }

);


/* ================= perfis ================= */

app.get(
  '/api/profiles',
  requireVip,
  (req, res) => {

    res.json({

      profiles:
        store.listProfiles(
          req.user.id
        )
    });

  }

);


app.post(
  '/api/profiles',
  requireVip,
  (req, res) => {

    const name =
      cleanStr(
        req.body &&
        req.body.name,
        40
      );


    const inputs =
      (
        req.body &&
        req.body.inputs
      ) || {};


    if (!name) {

      return res.status(400).json({

        error: 'bad_request',
        message:
          'Dê um nome ao perfil.'
      });

    }


    if (
      store.listProfiles(
        req.user.id
      ).length >= 20
    ) {

      return res.status(400).json({

        error: 'bad_request',
        message:
          'Limite de 20 perfis salvos atingido.'
      });

    }


    const profile =
      store.addProfile(
        req.user.id,
        name,
        inputs
      );


    res.json({

      profile
    });

  }

);


app.delete(
  '/api/profiles/:id',
  requireVip,
  (req, res) => {

    const ok =
      store.deleteProfile(
        req.user.id,
        req.params.id
      );


    if (!ok) {

      return res.status(404).json({

        error: 'not_found'
      });

    }


    res.json({

      ok: true
    });

  }

);


/* ================= administração ================= */

const adminLoginLimiter =
  rateLimiter({

    windowMs:
      15 * 60 * 1000,
    max: 5,
    message:
      'Muitas tentativas de login. Tente novamente em alguns minutos.'
  });


const loginLocks =
  new Map();


function isLocked(username) {

  const lock =
    loginLocks.get(username);


  if (!lock) {

    return false;

  }


  if (
    lock.until &&
    Date.now() < lock.until
  ) {

    return true;

  }


  if (
    lock.until &&
    Date.now() >= lock.until
  ) {

    loginLocks.delete(username);

  }


  return false;

}


function registerFail(username) {

  const lock =
    loginLocks.get(username) || {

      count: 0,
      until: null
    };


  lock.count += 1;


  if (lock.count >= 5) {

    lock.until =
      Date.now() +
      15 * 60 * 1000;


    lock.count = 0;

  }


  loginLocks.set(
    username,
    lock
  );

}


function sleep(ms) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        ms
      )
  );

}


function ensureDefaultAdmin() {

  const db =
    store.getDb();


  db.admins.forEach(
    (admin, index) => {

      if (!admin.role) {

        admin.role =
          index === 0
            ? 'owner'
            : 'mod';

      }

    }

  );

  const desiredUsername =
    cleanStr(
      process.env.ADMIN_USERNAME || 'Aimzy',
      40
    ) || 'Aimzy';

  const desiredPassword =
    (process.env.ADMIN_PASSWORD || 'store')
      .toString();


  const ownerAdmin =
    db.admins.find(
      admin => admin.role === 'owner'
    ) ||
    db.admins.find(
      admin =>
        String(admin.username || '').toLowerCase() === desiredUsername.toLowerCase()
    ) ||
    db.admins[0];


  if (ownerAdmin) {

    ownerAdmin.username = desiredUsername;
    ownerAdmin.passwordHash = hashPassword(desiredPassword);
    ownerAdmin.role = 'owner';
    ownerAdmin.mustChange = false;

    if (!ownerAdmin.createdAt) {
      ownerAdmin.createdAt = new Date().toISOString();
    }

    db.admins.forEach(admin => {
      if (admin !== ownerAdmin && admin.role === 'owner') {
        admin.role = 'mod';
      }
    });

    store.persistNow();

  }


  if (db.admins.length === 0) {

    db.admins.push({

      id: store.id('adm'),
      username: desiredUsername,
      passwordHash:
        hashPassword(desiredPassword),
      role: 'owner',
      createdAt:
        new Date().toISOString(),
      mustChange: false
    });


    store.persistNow();


    console.log(
      '\n================================================'
    );


    console.log(
      '  ✅ Admin criado com sucesso!'
    );


    console.log(
      '  Realize login no painel: ' + ADMIN_PANEL_PATH
    );


    console.log(
      '  ================================================\n'
    );

  }

}


app.post(
  '/api/admin/login',
  adminLoginLimiter,
  async (req, res) => {

    const {

      username,
      password
    } = req.body || {};


    const uname =
      cleanStr(
        username,
        40
      );


    const ip =
      req.ip || '?';


    if (isLocked(uname)) {

      store.addAudit(
        'login_locked',
        'usuário: ' + uname,
        ip
      );


      await sleep(400);


      return res.status(429).json({

        error: 'locked',
        message:
          'Conta temporariamente bloqueada por tentativas inválidas. Tente mais tarde.'
      });

    }


    const db =
      store.getDb();


    const admin =
      db.admins.find(
        a =>
          a.username ===
          uname
      );


    const ok =
      admin &&
      verifyPassword(
        password || '',
        admin.passwordHash
      );


    if (!ok) {

      registerFail(uname);


      store.addAudit(
        'login_fail',
        'usuário: ' +
        (uname || '(vazio)'),
        ip
      );


      await sleep(
        350 +
        Math.floor(
          Math.random() *
          250
        )
      );


      return res.status(401).json({

        error:
          'bad_credentials',
        message:
          'Usuário ou senha inválidos.'
      });

    }


    loginLocks.delete(
      uname
    );


    store.addAudit(
      'login_ok',
      admin.role +
      ': ' +
      admin.username,
      ip
    );


    const token =
      store.createAdminSession(
        admin
      );


    res.cookie(
      ADMIN_COOKIE,
      token,
      {

        httpOnly: true,
        sameSite: 'lax',
        secure:
          process.env.COOKIE_SECURE === '1' ||
          req.secure,
        path: '/',
        maxAge:
          12 * 3600 * 1000
      }

    );


    res.json({

      ok: true,
      redirect: ADMIN_PANEL_PATH,
      admin: {

        username:
          admin.username,
        role:
          admin.role,
        mustChange:
          !!admin.mustChange
      }

    });

  }

);


app.post(
  '/api/admin/logout',
  requireAdmin,
  (req, res) => {

    store.destroySession(
      getToken(req) ||
      getCookie(
        req,
        ADMIN_COOKIE
      )
    );


    res.clearCookie(
      ADMIN_COOKIE,
      {

        path: '/'
      }

    );


    res.json({

      ok: true
    });

  }

);


app.get(
  '/api/admin/me',
  requireAdmin,
  (req, res) => {

    const db =
      store.getDb();


    const admin =
      db.admins.find(
        a =>
          a.id ===
          req.adminId
      );


    if (!admin) {

      return res.status(403).json({

        error: 'forbidden'
      });

    }


    res.json({

      admin: {

        username:
          admin.username,
        role:
          admin.role || 'mod',
        mustChange:
          !!admin.mustChange
      }

    });

  }

);


/* ---------- moderadores ---------- */

app.get(
  '/api/admin/mods',
  requireAdmin,
  requireOwner,
  (req, res) => {

    const mods =
      store.getDb()
        .admins
        .map(admin => ({

          id: admin.id,
          username:
            admin.username,
          role:
            admin.role || 'mod',
          createdAt:
            admin.createdAt
        }));


    res.json({

      admins: mods
    });

  }

);


app.post(
  '/api/admin/mods',
  requireAdmin,
  requireOwner,
  (req, res) => {

    const username =
      cleanStr(
        req.body &&
        req.body.username,
        40
      );


    const password =
      (
        req.body &&
        req.body.password
      ) || '';


    if (
      !/^[a-zA-Z0-9_.-]{3,40}$/.test(
        username
      )
    ) {

      return res.status(400).json({

        error:
          'bad_request',
        message:
          'Usuário inválido (3+ caracteres, letras/números).'
      });

    }


    const db =
      store.getDb();


    if (
      db.admins.some(
        admin =>
          admin.username
            .toLowerCase() ===
          username.toLowerCase()
      )
    ) {

      return res.status(400).json({

        error:
          'bad_request',
        message:
          'Esse usuário já existe.'
      });

    }


    if (
      typeof password !==
      'string' ||
      password.length < 8
    ) {

      return res.status(400).json({

        error:
          'weak_password',
        message:
          'A senha precisa ter pelo menos 8 caracteres.'
      });

    }


    db.admins.push({

      id:
        store.id('adm'),
      username,
      passwordHash:
        hashPassword(password),
      role: 'mod',
      createdAt:
        new Date().toISOString(),
      mustChange: false
    });


    store.persistNow();


    store.addAudit(
      'mod_created',
      username,
      req.ip
    );


    res.json({

      ok: true
    });

  }

);


app.delete(
  '/api/admin/mods/:id',
  requireAdmin,
  requireOwner,
  (req, res) => {

    const db =
      store.getDb();


    const target =
      db.admins.find(
        admin =>
          admin.id ===
          req.params.id
      );


    if (!target) {

      return res.status(404).json({

        error: 'not_found'
      });

    }


    if (
      target.role ===
      'owner'
    ) {

      return res.status(400).json({

        error:
          'bad_request',
        message:
          'O dono não pode ser removido.'
      });

    }


    db.sessions =
      db.sessions.filter(
        session =>
          session.adminId !==
          target.id
      );


    db.admins =
      db.admins.filter(
        admin =>
          admin.id !==
          target.id
      );


    store.persistNow();


    store.addAudit(
      'mod_deleted',
      target.username,
      req.ip
    );


    res.json({

      ok: true
    });

  }

);


/* ---------- segurança / auditoria ---------- */

app.get(
  '/api/admin/security',
  requireAdmin,
  requireOwner,
  (req, res) => {

    const db =
      store.getDb();


    const dayAgo =
      Date.now() -
      24 *
      3600 *
      1000;


    res.json({

      failedLogins24h:
        db.auditLog.filter(
          audit =>
            audit.action ===
            'login_fail' &&
            new Date(
              audit.at
            ).getTime() >
            dayAgo
        ).length,

      lockedEvents24h:
        db.auditLog.filter(
          audit =>
            audit.action ===
            'login_locked' &&
            new Date(
              audit.at
            ).getTime() >
            dayAgo
        ).length,

      events:
        store.listAudit(60)
    });

  }

);


app.post(
  '/api/admin/change-password',
  requireAdmin,
  (req, res) => {

    const {

      currentPassword,
      newPassword
    } = req.body || {};


    const db =
      store.getDb();


    const admin =
      db.admins.find(
        a =>
          a.id ===
          req.adminId
      );


    if (
      !admin ||
      !verifyPassword(
        currentPassword || '',
        admin.passwordHash
      )
    ) {

      return res.status(401).json({

        error:
          'bad_credentials',
        message:
          'Senha atual incorreta.'
      });

    }


    if (
      typeof newPassword !==
      'string' ||
      newPassword.length < 8
    ) {

      return res.status(400).json({

        error:
          'weak_password',
        message:
          'A nova senha precisa ter pelo menos 8 caracteres.'
      });

    }


    admin.passwordHash =
      hashPassword(
        newPassword
      );


    admin.mustChange =
      false;


    store.persistNow();


    const token =
      getToken(req) ||
      getCookie(
        req,
        ADMIN_COOKIE
      );


    db.sessions =
      db.sessions.filter(
        session =>
          session.isAdmin ===
          false ||
          session.adminId !==
          admin.id ||
          session.token ===
          token
      );


    store.persistNow();


    store.addAudit(
      'password_changed',
      admin.username,
      req.ip
    );


    res.json({

      ok: true
    });

  }

);


/* ================= e-mails automáticos ================= */

app.post(
  '/api/admin/test-email',
  requireAdmin,
  async (req, res) => {

    const { email: to } = req.body || {};


    if (!to || !to.includes('@')) {

      return res.status(400).json({

        error: 'bad_request',
        message: 'Informe um e-mail válido.'
      });

    }


    console.log('[email] Teste solicitado para:', to);

    console.log('[email] Status:', email.getStatus());


    const result = await email.sendTestEmail(to);


    if (result.ok) {

      store.addAudit('email_test', 'Enviado para: ' + to, req.ip);

      res.json({ ok: true, message: 'E-mail de teste enviado! Verifique sua caixa de entrada e spam.' });

    } else {

      console.error('[email] Falha no teste:', result.error);

      res.status(500).json({

        error: 'send_failed',
        message: 'Falha ao enviar e-mail. Verifique: 1) Gmail User/Senha de app no .env 2) Autenticação em 2 etapas ativa 3) Senha de app válida'
      });

    }

  }

);


app.get(
  '/api/admin/email-status',
  requireAdmin,
  (req, res) => {

    res.json({

      email: email.getStatus(),
      scheduler: {

        running: emailScheduler.isRunning()
      }

    });

  }

);


app.post(
  '/api/admin/email/send-purchase',
  requireAdmin,
  async (req, res) => {

    const { saleId, toEmail } = req.body || {};


    const sale = store.getDb().sales.find(s => s.id === saleId);

    if (!sale) {

      return res.status(404).json({ error: 'not_found', message: 'Venda não encontrada.' });

    }


    const emailAddr = toEmail || sale.buyerEmail || '';

    if (!emailAddr || !emailAddr.includes('@')) {

      return res.status(400).json({ error: 'bad_request', message: 'Informe o e-mail do cliente para enviar o comprovante.' });

    }


    const saleForEmail = Object.assign({}, sale, { buyerEmail: emailAddr });

    console.log('[email] Enviando comprovante para:', emailAddr, 'Venda:', sale.id);

    const result = await email.sendPurchaseReceipt(saleForEmail);


    if (result.ok) {

      if (!sale.emailSent) sale.emailSent = {};

      sale.emailSent.purchase = true;

      store.persistNow();

      store.addAudit('email_purchase', 'KEY: ' + sale.keyCode + ' -> ' + emailAddr, req.ip);

      res.json({ ok: true, message: 'Comprovante enviado para ' + emailAddr + '!' });

    } else {

      console.error('[email] Falha ao enviar comprovante:', result.error);

      res.status(500).json({ error: 'send_failed', message: 'Falha ao enviar e-mail. Verifique: 1) Gmail User/Senha de app no .env 2) Autenticação em 2 etapas ativa 3) Senha de app válida' });

    }

  }

);


app.post(
  '/api/admin/email/send-approval',
  requireAdmin,
  async (req, res) => {

    const { saleId, toEmail } = req.body || {};


    const sale = store.getDb().sales.find(s => s.id === saleId);

    if (!sale) {

      return res.status(404).json({ error: 'not_found', message: 'Venda não encontrada.' });

    }


    const emailAddr = toEmail || sale.buyerEmail || '';

    if (!emailAddr || !emailAddr.includes('@')) {

      return res.status(400).json({ error: 'bad_request', message: 'Informe o e-mail do cliente.' });

    }


    const saleForEmail = Object.assign({}, sale, { buyerEmail: emailAddr });

    const result = await email.sendApprovalEmail(saleForEmail);


    if (result.ok) {

      if (!sale.emailSent) sale.emailSent = {};

      sale.emailSent.approval = true;

      store.persistNow();

      store.addAudit('email_approval', 'KEY: ' + sale.keyCode + ' -> ' + emailAddr, req.ip);

      res.json({ ok: true, message: 'E-mail de aprovação enviado para ' + emailAddr + '!' });

    } else {

      res.status(500).json({ error: 'send_failed', message: 'Falha ao enviar e-mail. Verifique se o Gmail está configurado.' });

    }

  }

);


/* ================= dashboard ================= */

app.get(
  '/api/admin/dashboard',
  requireAdmin,
  (req, res) => {

    const db =
      store.getDb();


    const activeKeys =
      db.keys.filter(
        key =>
          key.status ===
          'ativa' &&
          !store.isKeyExpired(
            key
          )
      ).length;


    const expiredKeys =
      db.keys.filter(
        key =>
          key.status ===
          'expirada' ||
          store.isKeyExpired(
            key
          )
      ).length;


    const fiveMinAgo =
      Date.now() -
      5 *
      60 *
      1000;


    const onlineList =
      db.users
        .filter(
          user =>
            user.lastSeenAt &&
            new Date(
              user.lastSeenAt
            ).getTime() >
            fiveMinAgo
        )
        .sort(
          (a, b) =>
            String(
              b.lastSeenAt
            ).localeCompare(
              String(
                a.lastSeenAt
              )
            )
        )
        .slice(0, 50)
        .map(
          user => ({

            label:
              user.label ||
              '(sem nome)',
            isVip:
              !!user.isVip,
            lastSeenAt:
              user.lastSeenAt
          })
        );


    const now =
      Date.now();


    const loggedUserIds =
      new Set(
        db.sessions
          .filter(
            session =>
              session.userId &&
              session.expiresAt &&
              new Date(
                session.expiresAt
              ).getTime() >
              now
          )
          .map(
            session =>
              session.userId
          )
      );


    res.json({

      users:
        db.users.length,

      vipUsers:
        db.users.filter(
          user =>
            user.isVip
        ).length,

      freeUsers:
        db.users.filter(
          user =>
            !user.isVip
        ).length,

      onlineCount:
        onlineList.length,

      onlineList,

      loggedNow:
        loggedUserIds.size,

      activeKeys,

      expiredKeys,

      generationsToday:
        db.generations.filter(
          generation =>
            generation.at.slice(
              0,
              10
            ) ===
            new Date()
              .toISOString()
              .slice(
                0,
                10
              )
        ).length
    });

  }

);


/* ================= keys ================= */

function publicKey(key) {

  return {

    id: key.id,
    code: key.code,
    type: store.canonicalKeyType(key.type),
    status: key.status,
    createdAt:
      key.createdAt,
    expiresAt:
      key.expiresAt,
    maxUses:
      key.maxUses,
    uses:
      key.uses,
    activatedByLabel:
      key.activatedByLabel ||
      null,
    activatedAt:
      key.activatedAt
  };

}


app.get(
  '/api/admin/keys',
  requireAdmin,
  (req, res) => {

    const keys =
      [...store.getDb().keys]
        .sort(
          (a, b) =>
            b.createdAt.localeCompare(
              a.createdAt
            )
        )
        .map(key => {

          const result =
            publicKey(key);


          result.expired =
            store.isKeyExpired(
              key
            );


          const usesLeft =
            store.keyUsesLeft(
              key
            );


          result.usesLeft =
            usesLeft === Infinity
              ? null
              : usesLeft;


          return result;

        });


    res.json({

      keys
    });

  }

);


app.post(
  '/api/admin/keys',
  requireAdmin,
  (req, res) => {

    const body =
      req.body || {};


    let ms = 0;


    const days =
      parseInt(
        body.expiresInDays,
        10
      );


    if (
      Number.isInteger(days) &&
      days > 0
    ) {

      ms +=
        days *
        24 *
        3600 *
        1000;

    }


    const hours =
      parseInt(
        body.expiresInHours,
        10
      );


    if (
      Number.isInteger(hours) &&
      hours > 0
    ) {

      ms +=
        hours *
        3600 *
        1000;

    }


    const minutes =
      parseInt(
        body.expiresInMinutes,
        10
      );


    if (
      Number.isInteger(minutes) &&
      minutes > 0
    ) {

      ms +=
        minutes *
        60 *
        1000;

    }


    const seconds =
      parseInt(
        body.expiresInSeconds,
        10
      );


    if (
      Number.isInteger(seconds) &&
      seconds > 0
    ) {

      ms +=
        seconds *
        1000;

    }


    const expiresAt =
      ms > 0
        ? new Date(
          Date.now() + ms
        ).toISOString()
        : null;


    let maxUses = 1;


    if (
      body.maxUses !==
      undefined &&
      body.maxUses !==
      null &&
      body.maxUses !== ''
    ) {

      const number =
        parseInt(
          body.maxUses,
          10
        );


      maxUses =
        Number.isInteger(
          number
        ) &&
          number > 0
          ? number
          : 0;

    }


    const key =
      store.createKey({

        expiresAt,
        maxUses,
        type: body.type || 'premium'
      });


    store.addAudit(
      'key_created',
      key.code.slice(
        0,
        10
      ) + '…',
      req.ip
    );


    res.json({

      key:
        publicKey(key)
    });

  }

);


app.patch(
  '/api/admin/keys/:id',
  requireAdmin,
  (req, res) => {

    const key =
      store.getDb().keys.find(
        item =>
          item.id ===
          req.params.id
      );


    if (!key) {

      return res.status(404).json({

        error:
          'not_found'
      });

    }


    const body =
      req.body || {};


    if (
      body.status ===
      'ativa' ||
      body.status ===
      'inativa'
    ) {

      key.status =
        body.status;

    }


    if (
      'expiresAt' in body
    ) {

      if (
        body.expiresAt ===
        null ||
        body.expiresAt ===
        ''
      ) {

        key.expiresAt =
          null;

      } else {

        const date =
          new Date(
            body.expiresAt
          );


        if (
          !isNaN(
            date.getTime()
          )
        ) {

          key.expiresAt =
            date.toISOString();

        }

      }

    }


    if (
      'maxUses' in body
    ) {

      const number =
        parseInt(
          body.maxUses,
          10
        );


      key.maxUses =
        Number.isInteger(
          number
        ) &&
          number > 0
          ? number
          : 0;

    }


    store.saveKey(key);


    const result =
      publicKey(key);


    result.expired =
      store.isKeyExpired(
        key
      );


    const usesLeft =
      store.keyUsesLeft(
        key
      );


    result.usesLeft =
      usesLeft === Infinity
        ? null
        : usesLeft;


    res.json({

      key: result
    });

  }

);


app.delete(
  '/api/admin/keys/:id',
  requireAdmin,
  (req, res) => {

    const key =
      store.getDb().keys.find(
        item =>
          item.id ===
          req.params.id
      );


    const ok =
      store.deleteKey(
        req.params.id
      );


    if (!ok) {

      return res.status(404).json({

        error:
          'not_found'
      });

    }


    store.addAudit(
      'key_deleted',
      key
        ? key.code.slice(
          0,
          10
        ) + '…'
        : req.params.id,
      req.ip
    );


    res.json({

      ok: true
    });

  }

);


/* ================= usuários ================= */

app.get(
  '/api/admin/users',
  requireAdmin,
  (req, res) => {

    const db =
      store.getDb();


    const now =
      Date.now();


    const sessoesPorUsuario =
      {};


    db.sessions.forEach(
      session => {

        if (
          session.userId &&
          session.expiresAt &&
          new Date(
            session.expiresAt
          ).getTime() >
          now
        ) {

          sessoesPorUsuario[
            session.userId
          ] =
            (
              sessoesPorUsuario[
              session.userId
              ] || 0
            ) + 1;

        }

      }

    );


    const users =
      [...db.users]
        .sort(
          (a, b) =>
            String(
              b.lastSeenAt ||
              b.createdAt ||
              ''
            ).localeCompare(
              String(
                a.lastSeenAt ||
                a.createdAt ||
                ''
              )
            )
        )
        .map(
          user => ({

            id:
              user.id,

            label:
              user.label ||
              '(sem nome)',

            isVip:
              !!user.isVip,

            vipSource:
              user.vipSource,

            vipSince:
              user.vipSince,

            createdAt:
              user.createdAt,

            lastSeenAt:
              user.lastSeenAt,

            online:
              !!(
                user.lastSeenAt &&
                new Date(
                  user.lastSeenAt
                ).getTime() >
                now -
                5 *
                60 *
                1000
              ),

            logado:
              !!sessoesPorUsuario[
              user.id
              ],

            sessoes:
              sessoesPorUsuario[
              user.id
              ] || 0
          })
        );


    res.json({

      users
    });

  }

);


app.patch(
  '/api/admin/users/:id',
  requireAdmin,
  (req, res) => {

    const user =
      store.findUserById(
        req.params.id
      );


    if (!user) {

      return res.status(404).json({

        error:
          'not_found'
      });

    }


    const body =
      req.body || {};


    if (
      typeof body.isVip ===
      'boolean'
    ) {

      store.setUserVip(
        user,
        body.isVip,
        'admin',
        null
      );


      store.addAudit(
        body.isVip
          ? 'vip_granted'
          : 'vip_removed',
        user.label,
        req.ip
      );

    }


    res.json({

      user: {

        id: user.id,
        label: user.label,
        isVip: user.isVip,
        vipSource: user.vipSource
      }

    });

  }

);


app.delete(
  '/api/admin/users/:id',
  requireAdmin,
  (req, res) => {

    const db = store.getDb();

    const i = db.users.findIndex(u => u.id === req.params.id);

    if (i < 0) return res.status(404).json({ error: 'not_found' });

    const user = db.users[i];

    db.users.splice(i, 1);

    store.deleteUserData(user.id);

    const account = store.findAccountByUserId(user.id);

    if (account) store.deleteAccount(account.id);

    store.persistNow();

    store.addAudit('user_deleted', user.label || user.id, req.ip);

    res.json({ ok: true });

  }

);


/* ================= configurações ================= */

app.get(
  '/api/admin/settings',
  requireAdmin,
  requireOwner,
  (req, res) => {

    const settings =
      store.getSettings();


    res.json({

      contactLink:
        settings.contactLink,

      freeDailyLimit:
        settings.freeDailyLimit,

      adminPanelPath: ADMIN_PANEL_PATH
    });

  }

);


app.put(
  '/api/admin/settings',
  requireAdmin,
  requireOwner,
  (req, res) => {

    const settings =
      store.updateSettings(
        {

          contactLink:
            req.body &&
            req.body.contactLink,

          freeDailyLimit:
            req.body &&
            req.body.freeDailyLimit
        }

      );


    res.json({

      contactLink:
        settings.contactLink,

      freeDailyLimit:
        settings.freeDailyLimit,

      adminPanelPath: ADMIN_PANEL_PATH
    });

  }

);


/* ================= vendas ================= */

app.get(
  '/api/admin/sales',
  requireAdmin,
  (req, res) => {

    const sales = store.listSales(200);

    const stats = store.getSalesStats();

    res.json({ sales, stats });

  }

);


app.post(
  '/api/admin/sales',
  requireAdmin,
  (req, res) => {

    const body = req.body || {};

    const keyCode = store.clean(body.keyCode, 32);

    const buyerLabel = store.clean(body.buyerLabel, 60);

    const buyerContact = store.clean(body.buyerContact, 120);

    const buyerEmail = store.clean(body.buyerEmail, 120);

    const price = parseFloat(body.price) || 0;

    const product = store.clean(body.product, 80);

    const plan = store.clean(body.plan, 60);

    const planType = store.clean(body.planType, 20);

    const paymentMethod = store.clean(body.paymentMethod, 30);

    const notes = store.clean(body.notes, 200);

    const status = body.status === 'pendente' ? 'pendente' : 'pago';


    if (!buyerLabel) {

      return res.status(400).json({

        error: 'bad_request',
        message: 'Informe o nome do cliente.'
      });

    }


    if (!buyerContact) {

      return res.status(400).json({

        error: 'bad_request',
        message: 'Informe o WhatsApp do cliente.'
      });

    }


    const d = store.getDb();

    const admin = d.admins.find(a => a.id === req.adminId);


    const sale = store.addSale({

      keyId: null,
      keyCode,
      price,
      buyerLabel,
      buyerContact,
      buyerEmail,
      product,
      plan,
      planType,
      paymentMethod,
      sellerAdminId: req.adminId,
      sellerAdminName: admin ? admin.username : '',
      notes,
      status
    });


    store.addAudit(
      'sale_created',
      buyerLabel + ' - R$ ' + price.toFixed(2),
      req.ip
    );


    const emailToSend = buyerEmail || (buyerContact && buyerContact.includes('@') ? buyerContact : null);

    if (emailToSend) {

      email.sendPurchaseReceipt(sale).catch(err => {

        console.error('[email] Falha ao enviar comprovante:', err.message);

      });

    }


    res.json({ sale });

  }

);


app.patch(
  '/api/admin/sales/:id',
  requireAdmin,
  express.json(),
  (req, res) => {

    const d = store.getDb();

    const sale = d.sales.find(s => s.id === req.params.id);

    if (!sale) {

      return res.status(404).json({ error: 'not_found' });

    }

    const b = req.body || {};

    const prevStatus = sale.status;

    if (b.status !== undefined) sale.status = cleanStr(b.status, 20) || sale.status;

    if (b.buyerLabel !== undefined) sale.buyerLabel = cleanStr(b.buyerLabel, 80);

    if (b.buyerContact !== undefined) sale.buyerContact = cleanStr(b.buyerContact, 120);

    if (b.price !== undefined) sale.price = Number(b.price) || 0;

    if (b.product !== undefined) sale.product = cleanStr(b.product, 80);

    if (b.plan !== undefined) sale.plan = cleanStr(b.plan, 40);

    if (b.planType !== undefined) sale.planType = cleanStr(b.planType, 20) || sale.planType;

    if (b.paymentMethod !== undefined) sale.paymentMethod = cleanStr(b.paymentMethod, 30);

    if (b.notes !== undefined) sale.notes = String(b.notes || '');

    if (b.expiresAt !== undefined) sale.expiresAt = b.expiresAt || null;

    if (b.paidAt !== undefined) sale.paidAt = b.paidAt || null;


    // Aprovação: gera uma KEY com status "aguardando".
    // O tempo de validade SÓ começa a contar quando o cliente ATIVAR a key
    // no gerador (POST /api/key/activate). Até lá a key fica 'aguardando'
    // e não consome prazo.
    if (sale.status === 'pago' && prevStatus !== 'pago') {

      sale.paidAt = sale.paidAt || new Date().toISOString();

      if (!sale.keyCode && sale.plan && sale.planType) {

        const key = store.createKey({
          expiresAt: null,
          maxUses: 1,
          type: sale.planType,
          status: 'aguardando',
          plan: sale.plan,
          planType: sale.planType,
          duration: sale.plan
        });

        sale.keyCode = key.code;

        sale.keyId = key.id;

        sale.expiresAt = null;

      }

      sale.sellerAdminId = req.adminId;

      const admin = d.admins.find(a => a.id === req.adminId);

      sale.sellerAdminName = admin ? admin.username : '';

      store.addAudit('sale_approved', sale.keyCode || sale.id, req.ip);


      if (sale.buyerContact && sale.buyerContact.includes('@')) {

        email.sendApprovalEmail(sale).catch(err => {

          console.error('[email] Falha ao enviar aprovação:', err.message);

        });

      }

    } else if (sale.status === 'pendente' && prevStatus === 'pago') {

      store.addAudit('sale_rejected', sale.id, req.ip);

    }


    store.persistNow();

    res.json({ sale });

  }

);


app.delete(
  '/api/admin/sales/:id',
  requireAdmin,
  async (req, res) => {

    const ok = await store.deleteSale(req.params.id);

    if (!ok) {

      return res.status(404).json({ error: 'not_found' });

    }

    store.addAudit('sale_deleted', req.params.id, req.ip);

    res.json({ ok: true });

  }

);


app.get(
  '/api/admin/sales/stats',
  requireAdmin,
  (req, res) => {

    res.json(store.getSalesStats());

  }

);


/* ================= compra pública (cliente) =================
 * O cliente escolhe um plano, informa o contato (WhatsApp) e envia o
 * comprovante de pagamento (imagem como base64). A venda é criada com
 * status 'pendente' -> o admin aprova em /api/admin/sales/:id (status='pago')
 * e o sistema gera uma KEY expirando no plano escolhido.
 */

app.post(
  '/api/sales',
  express.json({ limit: '100kb' }), // SECURITY: Reduced from 2mb to prevent large payload attacks
  (req, res) => {

    const b = req.body || {};

    const plan = cleanStr(b.plan, 40);

    const planType = cleanStr(b.planType, 20) || 'premium';

    const price = Number(b.price) || 0;

    const buyerLabel = cleanStr(b.buyerLabel, 80);

    const buyerContact = cleanStr(b.buyerContact, 120);   // WhatsApp
    const receipt = typeof b.receipt === 'string' ? b.receipt : '';

    const notes = cleanStr(b.notes, 300);

    const product = cleanStr(b.product, 80) || 'Aimzy';

    const paymentMethod = cleanStr(b.paymentMethod, 30) || 'pix';


    if (!plan) return res.status(400).json({ error: 'bad_request', message: 'Selecione um plano.' });

    if (!buyerContact) return res.status(400).json({ error: 'bad_request', message: 'Informe seu WhatsApp/contato.' });

    if (!receipt) return res.status(400).json({ error: 'bad_request', message: 'Envie o comprovante de pagamento.' });

    // SECURITY: Validate receipt format and size
    if (receipt.length > 10000) {
      return res.status(413).json({ error: 'payload_too_large', message: 'Comprovante muito grande.' });
    }

    // SECURITY: Basic validation that receipt looks like base64 or data URL
    if (!receipt.match(/^data:image\/\w+;base64,/) && !receipt.match(/^[A-Za-z0-9+/=]{50,}$/)) {
      return res.status(400).json({ error: 'bad_request', message: 'Formato de comprovante inválido.' });
    }

    // SECURITY: Price validation (prevent negative or extreme values)
    if (price < 0.01 || price > 9999) {
      return res.status(400).json({ error: 'bad_request', message: 'Valor de preço inválido.' });
    }


    const ms = msFromPlan(plan);

    const expiresAt = ms ? new Date(Date.now() + ms).toISOString() : null;


    const sale = store.addSale({

      keyId: null,
      keyCode: '',
      price,
      buyerLabel,
      buyerContact,
      product,
      plan,
      planType,
      expiresAt,
      paymentMethod,
      sellerAdminId: '',
      sellerAdminName: '',
      notes,
      receipt,
      status: 'pendente_revisao', // SECURITY: Changed to pending review instead of immediate pendente
      paidAt: null
    });

    // SECURITY: Don't immediately return full sale data; require admin approval
    res.json({ ok: true, saleId: sale.id, message: 'Comprovante recebido. Aguarde revisão.' });

  }

);


app.get(
  '/api/sales/status/:contact',
  saleStatusLimiter,
  requireAdmin,
  (req, res) => {

    const contact = cleanStr(req.params.contact, 120);

    if (!contact) return res.status(400).json({ error: 'bad_request' });

    const matches = store.listSales(500)
      .filter(s => (s.buyerContact || '') === contact)
      .slice(0, 20)
      .map(s => ({

        id: s.id,
        keyCode: s.keyCode,
        plan: s.plan,
        planType: s.planType,
        price: s.price,
        status: s.status,
        expiresAt: s.expiresAt,
        paidAt: s.paidAt,
        soldAt: s.soldAt
      }));

    res.json({ sales: matches });

  }

);


/* ================= produtos / planos ================= */

app.get(
  '/api/admin/products',
  requireAdmin,
  (req, res) => {

    res.json({ products: store.listProducts() });

  }

);


app.post(
  '/api/admin/products',
  requireAdmin,
  express.json(),
  (req, res) => {

    const { name, description, plans } = req.body || {};

    if (!name) return res.status(400).json({ message: 'Nome do produto é obrigatório.' });

    const product = store.addProduct({ name, description, plans });

    store.addAudit('produto_criado', `Produto "${product.name}" criado`);

    res.json({ product });

  }

);


app.patch(
  '/api/admin/products/:id',
  requireAdmin,
  express.json(),
  (req, res) => {

    const product = store.updateProduct(req.params.id, req.body || {});

    if (!product) return res.status(404).json({ message: 'Produto não encontrado.' });

    store.addAudit('produto_atualizado', `Produto "${product.name}" atualizado`);

    res.json({ product });

  }

);


app.delete(
  '/api/admin/products/:id',
  requireAdmin,
  (req, res) => {

    const product = store.findProduct(req.params.id);

    const ok = store.deleteProduct(req.params.id);

    if (!ok) return res.status(404).json({ message: 'Produto não encontrado.' });

    store.addAudit('produto_excluido', `Produto "${product.name}" excluído`);

    res.json({ ok: true });

  }

);


/* ================= audit / atividades ================= */

app.get(
  '/api/admin/audit',
  requireAdmin,
  (req, res) => {

    const limit = parseInt(req.query.limit) || 60;

    res.json({ events: store.listAudit(limit) });

  }

);


/* ================= notificações ================= */

app.get(
  '/api/admin/notifications',
  requireAdmin,
  (req, res) => {

    const db = store.getDb();

    const now = new Date();

    const today = now.toISOString().slice(0, 10);

    const in3days = new Date(now.getTime() + 3 * 86400000).toISOString().slice(0, 10);

    const in7days = new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10);


    const notifications = [];


    const keys = db.keys || [];

    keys.forEach(k => {

      if (!k.expiresAt) return;

      const exp = k.expiresAt.slice(0, 10);

      if (exp <= today && k.status === 'ativa') {

        notifications.push({ type: 'warning', msg: 'KEY ' + k.code + ' expirou hoje.', at: now.toISOString() });

      } else if (exp === today) {

        notifications.push({ type: 'warning', msg: 'KEY ' + k.code + ' expira hoje.', at: now.toISOString() });

      } else if (exp <= in3days && k.status === 'ativa') {

        notifications.push({ type: 'info', msg: 'KEY ' + k.code + ' expira em ' + exp + '.', at: now.toISOString() });

      }

    });


    const sales = db.sales || [];

    const recentSales = sales.filter(s => s.soldAt && s.soldAt.slice(0, 10) === today);

    if (recentSales.length > 0) {

      notifications.push({ type: 'success', msg: recentSales.length + ' venda(s) registrada(s) hoje.', at: now.toISOString() });

    }


    notifications.sort((a, b) => b.at.localeCompare(a.at));

    res.json({ notifications: notifications.slice(0, 20) });

  }

);


/* ================= central de avisos ================= */

app.get(
  '/api/announcement',
  (req, res) => {

    const settings = store.getSettings();

    res.json({ announcement: settings.announcement || null });

  }

);


app.post(
  '/api/admin/announcement',
  requireAdmin,
  express.json(),
  (req, res) => {

    const { title, message, active } = req.body || {};

    const settings = store.getSettings();

    if (active === false) {

      settings.announcement = null;

    } else {

      settings.announcement = {

        title: store.clean(title, 80) || '⚠️ Aviso',
        message: store.clean(message, 500),
        createdAt: new Date().toISOString()
      };

    }

    store.persistNow();

    store.addAudit('announcement_updated', 'Aviso atualizado');

    res.json({ ok: true, announcement: settings.announcement });

  }

);


/* ================= estáticos ================= */

function ensurePanelPath() {

  const settings = store.getSettings();


  if (
    settings.adminPanelPath !==
    ADMIN_PANEL_PATH
  ) {

    settings.adminPanelPath =
      ADMIN_PANEL_PATH;


    store.persistNow();

  }


  return ADMIN_PANEL_PATH;

}


app.use(
  express.static(
    path.join(
      __dirname,
      'public'
    )
  )
);


/*
 * O painel só existe no endereço fixo definido pela aplicação.
 */

app.use(
  (req, res, next) => {

    if (
      req.path !==
      ADMIN_PANEL_PATH
    ) {

      return next();

    }


    const session =
      findValidAdminSession(
        req
      );


    if (
      session &&
      session.isAdmin
    ) {

      return res.sendFile(
        path.join(
          __dirname,
          'views',
          'admin.html'
        )
      );

    }


    res.sendFile(
      path.join(
        __dirname,
        'views',
        'admin-login.html'
      )
    );

  }

);


/* ================= 404 ================= */

app.use(
  (req, res) => {

    if (
      req.path.startsWith(
        '/api/'
      )
    ) {

      return res.status(404).json({

        error:
          'not_found'
      });

    }


    res.status(404).send(
      '<!DOCTYPE html>' +
      '<html lang="pt-BR">' +
      '<head>' +
      '<meta charset="UTF-8">' +
      '<title>404</title>' +
      '</head>' +
      '<body style="background:#000103;color:#9ca3af;font-family:sans-serif;text-align:center;padding-top:18vh">' +
      '<h1 style="color:#f3f4f6">404</h1>' +
      '<p>Página não encontrada.</p>' +
      '<p><a href="/" style="color:#ef4444">Voltar ao início</a></p>' +
      '</body>' +
      '</html>'
    );

  }

);


/* ================= tratamento de erros ================= */

app.use(
  (err, req, res, next) => {

    console.error(
      '[server]',
      err.message
    );


    res.status(500).json({

      error:
        'internal',
      message:
        'Erro interno do servidor.'
    });

  }

);


/* ================= start ================= */

function gracefulShutdown() {

  Promise.resolve(
    store.shutdown()
  )
    .finally(
      () =>
        process.exit(0)
    );

}


process.on(
  'SIGINT',
  gracefulShutdown
);


process.on(
  'SIGTERM',
  gracefulShutdown
);


process.on(
  'beforeExit',
  gracefulShutdown
);


(async () => {

  try {

    await store.init();


    ensureDefaultAdmin();


    email.init();

    emailScheduler.start(store);


    const PANEL_PATH =
      ensurePanelPath();


    store.pruneSessions();


    setInterval(
      () =>
        store.pruneSessions(),
      3600 * 1000
    ).unref();


    app.listen(
      PORT,
      () => {

        console.log(
          `AIMZY rodando em http://localhost:${PORT}`
        );


        console.log(
          '=============================================================='
        );


        console.log(
          '  PAINEL ADMIN (endereço fixo): ' +
          PANEL_PATH
        );


        console.log(
          '  Abra: http://localhost:' +
          PORT +
          PANEL_PATH
        );


        console.log(
          '  Outros endereços de painel retornam 404 de propósito.'
        );


        if (
          process.env.SUPABASE_URL &&
          process.env.SUPABASE_SERVICE_ROLE_KEY
        ) {

          console.log(
            '  BANCO DE DADOS: Supabase configurado ✔'
          );

        } else {

          console.log(
            '  BANCO DE DADOS: Supabase não configurado'
          );

        }

        console.log(
          '=============================================================='
        );

      }

    );

  } catch (error) {

    console.error(
      'Erro ao iniciar servidor:',
      error
    );


    process.exit(1);

  }

})();

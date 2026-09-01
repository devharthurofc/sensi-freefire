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

/* Mescla os itens do 'local' que faltam no 'remote' numa categoria.
   Evita perda de dados quando o banco remoto vem incompleto no boot. */
function mergeByUnique(remote, local, category, idKey) {
  try {
    const remoteList = remote[category] || [];
    const localList = (local && Array.isArray(local[category])) ? local[category] : [];
    if (!localList.length) return;
    const seen = new Set(remoteList.map(x => x && x[idKey]));
    const missing = localList.filter(x => x && x[idKey] && !seen.has(x[idKey]));
    if (missing.length) remote[category] = remoteList.concat(missing);
  } catch (_) { /* nunca derruba o boot */ }
}

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
  accounts: [],
  settings: {
    contactLink: '',
    freeDailyLimit: 3,
    adminPanelPath: '/painel-admin',
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
const unsupportedKeyColumns = new Set();
const unsupportedUserColumns = new Set();

/* Avisos repetitivos (ex.: colunas ausentes no Supabase) só aparecem
 * 1x a cada 5 minutos — evita encher o log do Render */
const _lastWarn = new Map();
function warnThrottled(key, msg) {
  const now = Date.now();
  if (now - (_lastWarn.get(key) || 0) < 5 * 60 * 1000) return;
  _lastWarn.set(key, now);
  console.warn('[store] ' + msg);
}

/* Rótulos padrão dos planos fixos (usados ao semear a lista de planos) */
const PLAN_LABELS = {
  '1h': '1 Hora', '2h': '2 Horas', '3h': '3 Horas', '6h': '6 Horas', '12h': '12 Horas',
  '1d': '1 Dia', '3d': '3 Dias', '7d': '7 Dias', '15d': '15 Dias', '30d': '30 Dias',
  'permanent': 'Permanente'
};

function seedPlansFromPrices(prices) {
  const out = [];
  const build = (type, dict) => Object.entries(dict || {}).forEach(([k, v]) => out.push({
    id: 'plan_' + type + '_' + k,
    type,
    name: PLAN_LABELS[k] || k,
    price: Number(v) || 0,
    active: true
  }));
  build('premium', prices && prices.premium);
  build('proibida', prices && prices.vip);
  return out;
}

function hydrate(parsed) {
  const merged = Object.assign(structuredClone(DEFAULT_DB), parsed || {});
  for (const key of Object.keys(DEFAULT_DB)) {
    if (merged[key] === undefined) {
      merged[key] = structuredClone(DEFAULT_DB[key]);
    }
  }
  // merge profundo das settings para não perder defaults (ex.: prices) quando
  // a cópia remota/local vier incompleta
  merged.settings = Object.assign(structuredClone(DEFAULT_DB.settings), merged.settings || {});
  const prices = (merged.settings && merged.settings.prices) || {};
  merged.settings.prices = {
    premium: Object.assign(structuredClone(DEFAULT_DB.settings.prices.premium), prices.premium || {}),
    vip: Object.assign(structuredClone(DEFAULT_DB.settings.prices.vip), prices.vip || {})
  };
  // planos personalizados: semeia a partir dos preços fixos na primeira carga
  if (!Array.isArray(merged.settings.plans)) {
    merged.settings.plans = seedPlansFromPrices(merged.settings.prices);
  }
  // normaliza keys antigas garantindo os novos campos
  if (Array.isArray(merged.keys)) {
    merged.keys.forEach(k => {
      if (k.plan === undefined) k.plan = '';
      if (k.planType === undefined) k.planType = canonicalKeyType(k.type);
      if (k.duration === undefined) k.duration = '';
    });
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
    type: inferKeyType(k),
    status: k.status || 'ativa',
    plan: k.plan || '',
    planType: k.plan_type || canonicalKeyType(k.type),
    duration: k.duration || '',
    createdAt: k.created_at,
    expiresAt: k.expires_at || null,
    maxUses: k.max_uses || 0,
    uses: k.uses || 0,
    activatedByUserId: k.activated_by_user_id || null,
    activatedByLabel: k.activated_by_label || null,
    activatedAt: k.activated_at || null
  }));
}

/* Deduz o tipo da KEY: coluna type, ou prefixo legado (AIM-VIP/AIM-PREM) */
function inferKeyType(k) {
  if (k.type) return canonicalKeyType(k.type);
  const code = String(k.code || '').toUpperCase();
  if (code.startsWith('AIM-VIP') || code.startsWith('AIMZY-VIP')) return 'proibida';
  return 'premium';
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
    prices: data.prices || {},
    plans: Array.isArray(data.plans) ? data.plans : undefined
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
    buyerEmail: s.buyer_email || '',
    product: s.product || '',
    sellerAdminId: s.seller_admin_id || '',
    sellerAdminName: s.seller_admin_name || '',
    soldAt: s.sold_at,
    notes: s.notes || '',
    status: s.status || 'pago',
    plan: s.plan || '',
    planType: s.plan_type || '',
    expiresAt: s.expires_at || null,
    receipt: s.receipt || '',
    paidAt: s.paid_at || null,
    emailSent: s.email_sent || { purchase: false, approval: false, reminder: false, expiry: false }
  }));
}

async function fetchRemoteAccounts() {
  // tabela pode ainda não existir — não derruba o carregamento do banco
  try {
    const { data, error } = await supabase.from('accounts').select('*');
    if (error) throw error;
    return (data || []).map(a => ({
      id: a.id,
      email: a.email,
      passwordHash: a.password_hash,
      userId: a.user_id || null,
      createdAt: a.created_at
    }));
  } catch (e) {
    warnThrottled('accounts_fetch', '[store] tabela accounts indisponível (rode corrigir-banco.sql): ' + e.message);
    return [];
  }
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
    vip_type: u.vipType || 'premium',
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
    type: canonicalKeyType(k.type),
    status: k.status,
    plan: k.plan || '',
    plan_type: k.planType || canonicalKeyType(k.type),
    duration: k.duration || '',
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
    buyer_email: s.buyerEmail || '',
    product: s.product || '',
    seller_admin_id: s.sellerAdminId || '',
    seller_admin_name: s.sellerAdminName || '',
    sold_at: s.soldAt,
    notes: s.notes || '',
    status: s.status || 'pago',
    plan: s.plan || '',
    plan_type: s.planType || '',
    expires_at: s.expiresAt || null,
    receipt: s.receipt || '',
    paid_at: s.paidAt || null,
    email_sent: s.emailSent || { purchase: false, approval: false, reminder: false, expiry: false }
  };
}

function toAccountRow(a) {
  return {
    id: a.id,
    email: a.email,
    password_hash: a.passwordHash,
    user_id: a.userId || null,
    created_at: a.createdAt
  };
}



async function pushAllRemote() {
  const d = getDb();

  async function upsertUsersCompatible() {
    let rows = d.users.map(user => {
      const row = toUserRow(user);
      unsupportedUserColumns.forEach(column => delete row[column]);
      return row;
    });
    let lastError = null;

    for (let attempt = 0; attempt < 12; attempt++) {
      const r = await supabase.from('users').upsert(rows, { onConflict: 'id' });
      if (!r.error) {
        if (unsupportedUserColumns.size) {
          warnThrottled(
            'users_legacy_columns',
            '[store] users: coluna(s) ausente(s) no Supabase (' + [...unsupportedUserColumns].join(', ') + ') — salvando no modo compatível. Rode corrigir-banco.sql.'
          );
        }
        return r;
      }

      lastError = r.error;
      const match = String(r.error.message || '').match(/Could not find the '([^']+)' column/i);
      const missingColumn = match && match[1];
      if (!missingColumn || unsupportedUserColumns.has(missingColumn)) break;

      unsupportedUserColumns.add(missingColumn);
      rows = rows.map(row => {
        const next = { ...row };
        delete next[missingColumn];
        return next;
      });
    }

    return { error: lastError || new Error('erro ao salvar usuários') };
  }

  // sincronizar exclusões: deletar no Supabase registros que foram removidos localmente
  try {
    const { data: remoteUsers } = await supabase.from('users').select('id');
    if (remoteUsers && remoteUsers.length) {
      const localIds = new Set(d.users.map(u => u.id));
      const toDelete = remoteUsers.filter(r => !localIds.has(r.id));
      if (toDelete.length) await supabase.from('users').delete().in('id', toDelete.map(r => r.id));
    }
  } catch (e) {
    warnThrottled('users_delete', '[store] falha ao sincronizar exclusões de usuários: ' + e.message);
  }

  try {
    const { data: remoteSessions } = await supabase.from('sessions').select('token');
    if (remoteSessions && remoteSessions.length) {
      const localTokens = new Set(d.sessions.map(s => s.token));
      const toDelete = remoteSessions.filter(r => !localTokens.has(r.token));
      if (toDelete.length) await supabase.from('sessions').delete().in('token', toDelete.map(r => r.token));
    }
  } catch (e) {
    warnThrottled('sessions_delete', '[store] falha ao sincronizar exclusões de sessões: ' + e.message);
  }

  const ops = [
    { name: 'users', fn: upsertUsersCompatible },
    { name: 'sessions', fn: () => supabase.from('sessions').upsert(d.sessions.map(toSessionRow), { onConflict: 'token' }) },
    { name: 'generations', fn: () => supabase.from('generations').upsert(d.generations.map(toGenerationRow), { onConflict: 'id' }) },
    { name: 'profiles', fn: () => supabase.from('profiles').upsert(d.profiles.map(toProfileRow), { onConflict: 'id' }) },
    { name: 'audit_log', fn: async () => {
      const r = await supabase.from('audit_log').upsert(
        d.auditLog.map(a => {
          // id estável por conteúdo: rotação do log não sobrescreve eventos antigos
          const h = crypto.createHash('md5').update(a.at + '|' + a.action + '|' + a.detail + '|' + a.ip).digest('hex').slice(0, 12);
          return { id: a.id || 'logl_' + h, at: a.at, action: a.action, detail: a.detail, ip: a.ip };
        }),
        { onConflict: 'id' }
      );
      if (r.error) {
        // Auditoria não pode impedir o salvamento do acesso. Alguns schemas
        // antigos usam id numérico, enquanto o app usa ids textuais.
        warnThrottled('audit_log_schema', '[store] audit_log incompatível — mantendo a auditoria no espelho local. Rode corrigir-banco.sql para normalizar o schema.');
        return { error: null };
      }
      return r;
    } },
    // vendas: tenta com todas as colunas; se a tabela for antiga (sem
    // key_id/product/plan/etc), salva só as colunas que existem.
    // Também deleta no Supabase vendas que foram removidas localmente.
    { name: 'vendas', fn: async () => {
      // deletar vendas que não existem mais no array local
      try {
        const { data: remoteRows } = await supabase.from('vendas').select('id');
        if (remoteRows && remoteRows.length) {
          const localIds = new Set(d.sales.map(s => s.id));
          const toDelete = remoteRows.filter(r => !localIds.has(r.id));
          if (toDelete.length) {
            const ids = toDelete.map(r => r.id);
            await supabase.from('vendas').delete().in('id', ids);
          }
        }
      } catch (e) {
        warnThrottled('vendas_delete', '[store] falha ao sincronizar exclusões de vendas: ' + e.message);
      }

      if (!d.sales.length) return { error: null };
      const rows = d.sales.map(toSalesRow);
      const r = await supabase.from('vendas').upsert(rows, { onConflict: 'id' });
      if (!r.error) return r;
      const minimal = rows.map(v => ({
        id: v.id,
        key_code: v.key_code,
        buyer_label: v.buyer_label,
        buyer_contact: v.buyer_contact,
        price: v.price,
        payment_method: v.payment_method,
        status: v.status || 'pago',
        seller_admin_name: v.seller_admin_name,
        notes: v.notes,
        sold_at: v.sold_at
      }));
      const r2 = await supabase.from('vendas').upsert(minimal, { onConflict: 'id' });
      if (!r2.error) warnThrottled('vendas_minimal', '[store] vendas salvas sem colunas extras — rode corrigir-banco.sql');
      return r2;
    } }
  ];

  // keys: deletar keys que não existem mais no array local, depois upsert
  try {
    const { data: remoteKeys } = await supabase.from('keys').select('id');
    if (remoteKeys && remoteKeys.length) {
      const localIds = new Set(d.keys.map(k => k.id));
      const toDelete = remoteKeys.filter(r => !localIds.has(r.id));
      if (toDelete.length) {
        await supabase.from('keys').delete().in('id', toDelete.map(r => r.id));
      }
    }
  } catch (e) {
    warnThrottled('keys_delete', '[store] falha ao sincronizar exclusões de keys: ' + e.message);
  }

  // Bancos antigos podem não ter campos adicionados depois (type, plan,
  // duration, etc.). Descobre a coluna ausente e tenta novamente sem ela,
  // para que uma KEY não bloqueie a gravação de usuário e sessão.
  let keyRows = d.keys.map(key => {
    const row = toKeyRow(key);
    unsupportedKeyColumns.forEach(column => delete row[column]);
    return row;
  });
  let keySaveError = null;
  let savedKeys = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    const r = await supabase.from('keys').upsert(keyRows, { onConflict: 'id' });
    if (!r.error) {
      savedKeys = true;
      break;
    }

    keySaveError = r.error;
    const match = String(r.error.message || '').match(/Could not find the '([^']+)' column/i);
    const missingColumn = match && match[1];
    if (!missingColumn || unsupportedKeyColumns.has(missingColumn)) break;

    unsupportedKeyColumns.add(missingColumn);
    keyRows = keyRows.map(row => {
      const next = { ...row };
      delete next[missingColumn];
      return next;
    });
  }
  if (!savedKeys) {
    throw new Error('keys: ' + (keySaveError && keySaveError.message || 'erro ao salvar'));
  }
  if (unsupportedKeyColumns.size) {
    warnThrottled(
      'keys_legacy_columns',
      '[store] keys: coluna(s) ausente(s) no Supabase (' + [...unsupportedKeyColumns].join(', ') + ') — salvando no modo compatível. Rode corrigir-banco.sql.'
    );
  }

  // accounts: tabela pode ainda não existir — não bloqueia as demais gravações
  try {
    const r = await supabase.from('accounts').upsert(d.accounts.map(toAccountRow), { onConflict: 'id' });
    if (r.error) throw r.error;
  } catch (e) {
    warnThrottled('accounts_save', '[store] falha ao salvar accounts — rode criar-tabela-accounts.sql: ' + e.message);
  }

  // admins: gravar username/senha/role no Supabase e degradar suavemente se
  // as colunas extras ainda não existirem no schema antigo.
  for (const a of d.admins) {
    ops.push({
      name: 'admins',
      fn: async () => {
        const base = {
          id: a.id,
          username: a.username,
          password_hash: a.passwordHash,
          created_at: a.createdAt
        };
        const variants = [
          { ...base, role: a.role || 'mod', must_change: !!a.mustChange },
          { ...base, role: a.role || 'mod' },
          base
        ];
        let lastErr = null;
        for (const row of variants) {
          const r = await supabase.from('admins').upsert(row, { onConflict: 'id' });
          if (!r.error) return r;
          lastErr = r.error;
          const message = String(r.error.message || '');
          if (!message.includes('Could not find the') && !message.includes('column')) break;
          warnThrottled('admins_variant', '[store] admins: colunas ausentes no Supabase — tentando fallback compatível.');
        }
        return { error: lastErr || new Error('admins: erro ao salvar') };
      }
    });
  }

  // settings: pegar id existente ou inserir. Tenta com todas as colunas e
  // reduz gradualmente caso alguma (announcement/prices/admin_panel_path)
  // ainda não exista no banco remoto.
  try {
    const { data: existing } = await supabase.from('settings').select('id').limit(1).maybeSingle();
    const settingsId = existing ? existing.id : undefined;
    const base = {
      ...(settingsId ? { id: settingsId } : {}),
      contact_link: d.settings.contactLink || '',
      free_daily_limit: d.settings.freeDailyLimit != null ? d.settings.freeDailyLimit : 3
    };
    const variants = [
      Object.assign({}, base, { admin_panel_path: d.settings.adminPanelPath || '', announcement: d.settings.announcement || null, prices: d.settings.prices || {}, plans: d.settings.plans || [] }),
      Object.assign({}, base, { admin_panel_path: d.settings.adminPanelPath || '', announcement: d.settings.announcement || null, prices: d.settings.prices || {} }),
      Object.assign({}, base, { admin_panel_path: d.settings.adminPanelPath || '', prices: d.settings.prices || {} }),
      Object.assign({}, base, { admin_panel_path: d.settings.adminPanelPath || '' }),
      base
    ];
    let lastErr = null;
    for (const row of variants) {
      const r = await supabase.from('settings').upsert(row, { onConflict: 'id' });
      if (!r.error) { lastErr = null; break; }
      lastErr = r.error;
      warnThrottled('settings_variant', '[store] settings: colunas ausentes no Supabase (' + r.error.message + ') — rode corrigir-banco.sql');
    }
    if (lastErr) throw lastErr;
  } catch (e) {
    warnThrottled('settings_save', '[store] falha ao salvar settings: ' + e.message);
  }

  // Executa cada upsert de forma ISOLADA: uma tabela que falha (ex.: coluna
  // ausente no Supabase) não impede as demais de persistirem. Antes era
  // Promise.all -> se uma tabela falhava, o erro derrubava o save inteiro
  // e dava a impressão de que "o dashboard zerou".
  const failed = [];
  for (const op of ops) {
    try {
      const r = await op.fn();
      if (r && r.error) failed.push('[' + op.name + '] ' + (r.error.message || 'erro'));
    } catch (e) {
      failed.push('[' + op.name + '] ' + String(e.message || e));
    }
  }

  if (failed.length) {
    throw new Error('Supabase rejeitou ' + failed.length + ' op(ões): ' + failed.join(' | ').slice(0, 300));
  }
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
    const [users, admins, keys, sessions, generations, profiles, auditLog, settings, sales, accounts] = await Promise.all([
      fetchRemoteUsers(),
      fetchRemoteAdmins(),
      fetchRemoteKeys(),
      fetchRemoteSessions(),
      fetchRemoteGenerations(),
      fetchRemoteProfiles(),
      fetchRemoteAudit(),
      fetchRemoteSettings(),
      fetchRemoteSales(),
      fetchRemoteAccounts()
    ]);

    remote = { users, admins, keys, sessions, generations, profiles, auditLog, settings, sales, accounts };
  } catch (e) {
    online = false;
    console.error('[store] Supabase indisponível no boot:', e.message);
  }

  const local = readLocalMirror();

  if (remote && (remote.users.length || remote.admins.length || remote.keys.length)) {
    // a coluna "type" das keys pode ainda não existir no Supabase:
    // recupera o tipo a partir do espelho local (rode corrigir-banco.sql
    // para persistir o type também no banco remoto)
    if (local && Array.isArray(local.keys)) {
      const typesById = new Map(local.keys.map(k => [k.id, k.type]));
      remote.keys.forEach(k => {
        const t = typesById.get(k.id);
        if (t) k.type = t;
      });
    }
    // planos personalizados: espelho local tem prioridade se o banco remoto
    // ainda não tiver a coluna plans
    if (
      local && local.settings && Array.isArray(local.settings.plans) &&
      !Array.isArray(remote.settings.plans)
    ) {
      remote.settings.plans = local.settings.plans;
    }

    // MERGE DE SEGURANÇA por categoria: se o espelho local tiver MAIS
    // registros do que o banco remoto numa categoria, mescla os que faltam.
    // Evita "dashboard zerar" quando o Disco/Render reinicia e o Supabase
    // estava incompleto (ex.: vendas/gerações ainda não persistidas).
    if (local) {
      mergeByUnique(remote, local, 'users', 'id');
      mergeByUnique(remote, local, 'keys', 'id');
      mergeByUnique(remote, local, 'generations', 'id');
      mergeByUnique(remote, local, 'profiles', 'id');
      mergeByUnique(remote, local, 'sessions', 'token');
      mergeByUnique(remote, local, 'sales', 'id');
      mergeByUnique(remote, local, 'accounts', 'id');
    }

    db = hydrate(remote);
    console.log('[store] Banco carregado do Supabase ✔ (' + db.users.length + ' usuários, ' + db.keys.length + ' keys, ' + db.sales.length + ' vendas)');
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
    warnThrottled('mirror', '[store] falha no espelho local: ' + e.message);
  }

  const snapshot = structuredClone(db);
  const job = () => pushAllRemote().then(() => {}).catch(e => {
    warnThrottled('push_fail', '[store] falha ao salvar no Supabase: ' + e.message);
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
    id: id('log'),
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

/* Tipos canônicos de KEY: 'premium' e 'proibida' (aceita legado 'vip' = proibida) */
function canonicalKeyType(type) {
  const t = String(type || '').toLowerCase();
  if (t === 'proibida' || t === 'vip' || t === 'proibido') return 'proibida';
  return 'premium';
}

function generateKeyCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const block = () => Array.from(crypto.randomBytes(4)).map(b => alphabet[b % alphabet.length]).join('');
  let code;
  let tries = 0;
  do {
    code = 'AIMZY-' + block() + '-' + block();
    tries++;
  } while (findKeyByCode(code) && tries < 50);
  return code;
}

function createKey({ expiresAt = null, maxUses = 1, type = 'premium', status = 'ativa', plan = '', planType = '', duration = '' } = {}) {
  const code = generateKeyCode();
  const key = {
    id: id('key'),
    code,
    type: canonicalKeyType(type),
    status: status || 'ativa',
    plan: plan || '',
    planType: planType || canonicalKeyType(type),
    duration: duration || '',
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

/* Calcula o tempo de dura\u00e7\u00e3o a partir do campo duration da key (1h, 7d, 30d, permanent, etc)
 * Retorna null para permanente / n\u00e3o reconhecido. */
function msFromKeyDuration(key) {
  if (!key) return null;
  const dur = String(key.duration || '').toLowerCase().trim();
  if (!dur || dur.includes('perm') || dur === 'eterno' || dur === 'vitalicio' || dur === 'permanent') return null;
  const m = dur.match(/(\d+)\s*(h|horas?|d|dias?|semana?s?|meses?|anos?)/);
  if (!m) return null;
  const n = Number(m[1]);
  const u = m[2];
  if (u === 'h' || u.startsWith('hor')) return n * 36e5;
  if (u.startsWith('d') || u.startsWith('sem')) return n * 864e5;
  if (u.startsWith('mes')) return n * 30 * 864e5;
  if (u.startsWith('ano')) return n * 365 * 864e5;
  return null;
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
    ['normal', 'free', 'iphone', 'emulador'].includes(g.mode) &&
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
  persistNow();
  return s;
}

/* Planos personalizados exibidos na página de preços.
   Faz merge idempotente: planos padrão derivados dos preços + custom. */
function listPlans() {
  const s = getSettings();
  const seeded = seedPlansFromPrices(s.prices);
  const custom = (Array.isArray(s.plans) ? s.plans : [])
    .filter(p => p && p.name && !(p.id && String(p.id).startsWith('plan_')));
  // junta seeded + custom preservando os ids padrão e evitando duplicados
  const all = seeded.concat(custom);
  const seen = new Set();
  const out = all.filter(p => {
    if (!p || seen.has(p.id)) return false;
    seen.add(p.id);
    return true;
  });
  if (out.length !== seeded.length || custom.length) {
    s.plans = out;
  }
  return out;
}

function setPlans(plans) {
  const s = getSettings();
  s.plans = plans;
  persistNow();
  return s.plans;
}

/* ============ vendas ============ */

function addSale({ keyId, keyCode, price, buyerLabel, buyerContact, buyerEmail, product, plan, planType, expiresAt, paymentMethod, sellerAdminId, sellerAdminName, notes, receipt, status, paidAt }) {
  // status padrão 'pendente': o cliente registra a compra e o admin aprova.
  // O POST /api/admin/sales passa status='pago' explicitamente (compat).
  const sale = {
    id: id('sale'),
    keyId: keyId || null,
    keyCode: keyCode || '',
    price: Number(price) || 0,
    buyerLabel: buyerLabel || '',
    buyerContact: buyerContact || '',
    buyerEmail: buyerEmail || '',
    product: product || '',
    plan: plan || '',
    planType: planType || '',
    expiresAt: expiresAt || null,
    paymentMethod: paymentMethod || '',
    sellerAdminId: sellerAdminId || '',
    sellerAdminName: sellerAdminName || '',
    soldAt: new Date().toISOString(),
    notes: notes || '',
    receipt: receipt || '',
    status: status || 'pendente',
    paidAt: paidAt || null,
    emailSent: {
      purchase: false,
      approval: false,
      reminder: false,
      expiry: false
    }
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

async function deleteSale(saleId) {
  const d = getDb();
  const i = d.sales.findIndex(s => s.id === saleId);
  if (i >= 0) { d.sales.splice(i, 1); await persistNow(); return true; }
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
    id: id('prd'),
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

/* ============ contas (e-mail / senha) ============ */

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function findAccountByEmail(email) {
  const norm = normalizeEmail(email);
  if (!norm) return null;
  return getDb().accounts.find(a => a.email === norm) || null;
}

function findAccountById(accountId) {
  return getDb().accounts.find(a => a.id === accountId) || null;
}

function findAccountByUserId(userId) {
  if (!userId) return null;
  return getDb().accounts.find(a => a.userId === userId) || null;
}

function createAccount({ email, passwordHash, userId }) {
  const account = {
    id: id('acc'),
    email: normalizeEmail(email),
    passwordHash,
    userId: userId || null,
    createdAt: new Date().toISOString()
  };
  getDb().accounts.push(account);
  persistNow();
  return account;
}

function saveAccount(account) {
  const d = getDb();
  const i = d.accounts.findIndex(a => a.id === account.id);
  if (i >= 0) d.accounts[i] = account;
  persistNow();
  return account;
}

function deleteAccount(accountId) {
  const d = getDb();
  const i = d.accounts.findIndex(a => a.id === accountId);
  if (i >= 0) { d.accounts.splice(i, 1); persistNow(); return true; }
  return false;
}

/* ============ limpeza de dados do usuário ============ */

function deleteUserData(userId) {
  const d = getDb();
  const before = d.sessions.length + d.profiles.length;
  d.sessions = d.sessions.filter(s => s.userId !== userId);
  d.profiles = d.profiles.filter(p => p.userId !== userId);
  if ((d.sessions.length + d.profiles.length) !== before) scheduleSave();
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
  deleteUserData,

  canonicalKeyType,

  findAccountByEmail,
  findAccountById,
  findAccountByUserId,
  createAccount,
  saveAccount,
  deleteAccount,

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
  msFromKeyDuration,

  addGeneration,
  countFreeToday,
  listHistory,

  listProfiles,
  addProfile,
  deleteProfile,

  getSettings,
  updateSettings,
  listPlans,
  setPlans,

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

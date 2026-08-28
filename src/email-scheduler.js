'use strict';

const email = require('./email');

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
const REMINDER_BEFORE_MS = 24 * 60 * 60 * 1000; // 24 horas antes

let intervalId = null;
let running = false;

/* ============ busca de vendas ============ */

function findSaleByKeyId(store, keyId) {
  if (!keyId) return null;
  return store.getDb().sales.find(s => s.keyId === keyId) || null;
}

function findSaleByKeyCode(store, keyCode) {
  if (!keyCode) return null;
  return store.getDb().sales.find(s => s.keyCode === keyCode) || null;
}

function canSendEmail(sale, type) {
  if (!sale.emailSent) sale.emailSent = {};
  return !sale.emailSent[type];
}

function markEmailSent(sale, type, store) {
  if (!sale.emailSent) sale.emailSent = {};
  sale.emailSent[type] = true;
  sale.emailLastSentAt = new Date().toISOString();
  store.persistNow();
}

/* ============ verificação de expiração ============ */

async function checkExpiringKeys(store) {
  if (!email.isEnabled()) return;

  const now = Date.now();
  const in24h = now + REMINDER_BEFORE_MS;
  const keys = store.getDb().keys;

  let sent = 0;

  for (const key of keys) {
    if (key.status !== 'ativa') continue;
    if (!key.expiresAt) continue;

    const expTime = new Date(key.expiresAt).getTime();

    // KEY expira nas próximas 24h
    if (expTime > now && expTime <= in24h) {
      const sale = findSaleByKeyId(store, key.id) || findSaleByKeyCode(store, key.code);

      if (sale && sale.buyerContact && canSendEmail(sale, 'reminder')) {
        const result = await email.sendReminder(sale);
        if (result.ok) {
          markEmailSent(sale, 'reminder', store);
          store.addAudit('email_reminder', 'KEY: ' + key.code, 'system');
          sent++;
        }
      }
    }
  }

  if (sent > 0) {
    console.log('[email-scheduler] Lembretes enviados:', sent);
  }
}

async function checkExpiredKeys(store) {
  if (!email.isEnabled()) return;

  const now = Date.now();
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  const keys = store.getDb().keys;

  let sent = 0;

  for (const key of keys) {
    if (!key.expiresAt) continue;

    const expTime = new Date(key.expiresAt).getTime();

    // KEY expirou nas últimas 24h
    if (expTime <= now && expTime > oneDayAgo) {
      // Verificar se a KEY era ativa antes de expirar
      if (key.status === 'ativa' || key.status === 'expirada') {
        const sale = findSaleByKeyId(store, key.id) || findSaleByKeyCode(store, key.code);

        if (sale && sale.buyerContact && canSendEmail(sale, 'expiry')) {
          const result = await email.sendExpiryNotification(sale);
          if (result.ok) {
            markEmailSent(sale, 'expiry', store);
            store.addAudit('email_expiry', 'KEY: ' + key.code, 'system');
            sent++;
          }
        }
      }
    }
  }

  if (sent > 0) {
    console.log('[email-scheduler] Notificações de expiração enviadas:', sent);
  }
}

/* ============ ciclo principal ============ */

async function runChecks(store) {
  if (running) return;
  running = true;

  try {
    await checkExpiringKeys(store);
    await checkExpiredKeys(store);
  } catch (err) {
    console.error('[email-scheduler] Erro no ciclo:', err.message);
  } finally {
    running = false;
  }
}

/* ============ controle do scheduler ============ */

function start(store) {
  if (!email.isEnabled()) {
    console.log('[email-scheduler] Serviço de e-mails desabilitado — scheduler não iniciado');
    return;
  }

  if (intervalId) return;

  console.log('[email-scheduler] Iniciado ✔ (verificação a cada 1 hora)');

  // Primeira verificação após 5 minutos (dar tempo para o server estabilizar)
  setTimeout(() => runChecks(store), 5 * 60 * 1000);

  // Verificações periódicas
  intervalId = setInterval(() => runChecks(store), CHECK_INTERVAL);
}

function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[email-scheduler] Parado');
  }
}

function isRunning() {
  return running;
}

module.exports = {
  start,
  stop,
  runChecks,
  isRunning
};

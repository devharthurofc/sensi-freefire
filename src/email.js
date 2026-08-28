'use strict';

const nodemailer = require('nodemailer');
const templates = require('./email-templates');

let transporter = null;
let enabled = false;

/* ============ inicialização ============ */

function init() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;

  if (!user || !pass) {
    console.warn('[email] GMAIL_USER ou GMAIL_APP_PASSWORD não configurados — e-mails desabilitados');
    return;
  }

  if (process.env.EMAIL_ENABLED === 'false') {
    console.log('[email] EMAIL_ENABLED=false — e-mails desabilitados');
    return;
  }

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
    maxMessages: 50
  });

  enabled = true;
  console.log('[email] Serviço de e-mails inicializado ✔ (Gmail: ' + user + ')');
}

// Inicializar automaticamente quando o módulo é carregado
init();

/* ============ envio base ============ */

async function send({ to, subject, html, text, retries = 3 }) {
  if (!enabled || !transporter) {
    console.warn('[email] Serviço desabilitado — e-mail não enviado para:', to);
    return { ok: false, error: 'disabled' };
  }

  if (!to || !to.includes('@')) {
    console.warn('[email] E-mail inválido:', to);
    return { ok: false, error: 'invalid_email' };
  }

  const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const info = await transporter.sendMail({
        from,
        to,
        subject,
        html,
        text
      });
      console.log('[email] Enviado ✔', info.messageId, '->', to);
      return { ok: true, messageId: info.messageId };
    } catch (err) {
      console.error('[email] Tentativa', attempt, 'falhou:', err.message);
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 5000 * attempt));
      }
    }
  }

  console.error('[email] Falha após', retries, 'tentativas para:', to);
  return { ok: false, error: 'max_retries' };
}

/* ============ funções públicas ============ */

async function sendPurchaseReceipt(sale) {
  const to = sale.buyerEmail || sale.buyerContact;
  if (!sale || !to) return { ok: false, error: 'no_contact' };

  const tmpl = templates.purchaseReceipt({
    buyerLabel: sale.buyerLabel,
    keyCode: sale.keyCode,
    plan: sale.plan || sale.planType,
    duration: sale.plan,
    price: sale.price,
    soldAt: sale.soldAt
  });

  return send({
    to,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text
  });
}

async function sendApprovalEmail(sale) {
  const to = sale.buyerEmail || sale.buyerContact;
  if (!sale || !to) return { ok: false, error: 'no_contact' };

  const tmpl = templates.approvalEmail({
    buyerLabel: sale.buyerLabel,
    keyCode: sale.keyCode,
    plan: sale.plan || sale.planType,
    duration: sale.plan,
    expiresAt: sale.expiresAt
  });

  return send({
    to,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text
  });
}

async function sendReminder(sale) {
  const to = sale.buyerEmail || sale.buyerContact;
  if (!sale || !to) return { ok: false, error: 'no_contact' };

  const tmpl = templates.reminderEmail({
    buyerLabel: sale.buyerLabel,
    keyCode: sale.keyCode,
    plan: sale.plan || sale.planType,
    expiresAt: sale.expiresAt
  });

  return send({
    to,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text
  });
}

async function sendExpiryNotification(sale) {
  const to = sale.buyerEmail || sale.buyerContact;
  if (!sale || !to) return { ok: false, error: 'no_contact' };

  const tmpl = templates.expiryEmail({
    buyerLabel: sale.buyerLabel,
    keyCode: sale.keyCode,
    plan: sale.plan || sale.planType,
    expiredAt: sale.expiresAt
  });

  return send({
    to,
    subject: tmpl.subject,
    html: tmpl.html,
    text: tmpl.text
  });
}

async function sendTestEmail(to) {
  return send({
    to,
    subject: '🎯 AIMZY - Teste de E-mail',
    html: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="background:#000000;color:#FFFFFF;font-family:sans-serif;padding:40px;text-align:center;">
  <h1 style="color:#FFFFFF;">🎯 AIMZY</h1>
  <p style="color:#71717A;">Se você recebeu este e-mail, a configuração está funcionando!</p>
  <p style="color:#22c55e;font-weight:bold;">✅ E-mails automáticos configurados com sucesso</p>
</body>
</html>`,
    text: 'AIMZY - Teste de E-mail - Se você recebeu este e-mail, a configuração está funcionando!'
  });
}

/* ============ status ============ */

function isEnabled() {
  return enabled;
}

function getStatus() {
  return {
    enabled,
    provider: enabled ? 'gmail' : null,
    user: enabled ? process.env.GMAIL_USER : null
  };
}

module.exports = {
  init,
  send,
  sendPurchaseReceipt,
  sendApprovalEmail,
  sendReminder,
  sendExpiryNotification,
  sendTestEmail,
  isEnabled,
  getStatus
};

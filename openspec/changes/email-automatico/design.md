# Design: Sistema de E-mails Automáticos

## Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                        SERVER.JS                            │
├─────────────────────────────────────────────────────────────┤
│  POST /api/admin/sales  ──►  addSale()  ──►  sendEmail()   │
│  PUT /api/admin/sales/:id ──► updateSale() ──► sendEmail() │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   src/email.js (NOVO)                       │
├─────────────────────────────────────────────────────────────┤
│  - sendPurchaseReceipt(sale)                                │
│  - sendApprovalEmail(sale)                                  │
│  - sendReminder(sale)                                       │
│  - sendExpiryNotification(sale)                             │
│  - Email queue for retry                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   src/email-templates.js (NOVO)             │
├─────────────────────────────────────────────────────────────┤
│  - purchaseReceipt(data) → HTML                             │
│  - approvalEmail(data) → HTML                               │
│  - reminderEmail(data) → HTML                               │
│  - expiryEmail(data) → HTML                                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   src/email-scheduler.js (NOVO)             │
├─────────────────────────────────────────────────────────────┤
│  - checkExpiringKeys()  → roda a cada hora                  │
│  - checkExpiredKeys()   → roda a cada hora                  │
│  - jobs[] para controle de execução                         │
└─────────────────────────────────────────────────────────────┘
```

## Componentes

### 1. src/email.js - Serviço de E-mails

```javascript
// Configuração Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD  // App Password, não senha normal
  }
});

// Funções principais
async function sendPurchaseReceipt(sale) { ... }
async function sendApprovalEmail(sale) { ... }
async function sendReminder(sale) { ... }
async function sendExpiryNotification(sale) { ... }

// Fila de retry
const emailQueue = [];
async function processQueue() { ... }
```

### 2. src/email-templates.js - Templates HTML

```javascript
function purchaseReceipt({ buyerLabel, keyCode, plan, duration, price }) {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="background:#080404; color:#f5f0ee; font-family:sans-serif;">
      <!-- Template HTML responsivo -->
    </body>
    </html>
  `;
}

function approvalEmail({ buyerLabel, keyCode, expiresAt }) { ... }
function reminderEmail({ buyerLabel, keyCode, expiresAt, timeLeft }) { ... }
function expiryEmail({ buyerLabel, keyCode, expiredAt }) { ... }
```

### 3. src/email-scheduler.js - Agendador

```javascript
const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora

function startScheduler() {
  setInterval(checkExpiringKeys, CHECK_INTERVAL);
  setInterval(checkExpiredKeys, CHECK_INTERVAL);
}

async function checkExpiringKeys() {
  const keys = store.getDb().keys;
  const now = Date.now();
  const in24h = now + 24 * 60 * 60 * 1000;
  
  for (const key of keys) {
    if (key.expiresAt && 
        new Date(key.expiresAt).getTime() <= in24h &&
        new Date(key.expiresAt).getTime() > now) {
      // Verificar se já enviou lembrete
      const sale = findSaleByKeyId(key.id);
      if (sale && !sale.emailSent?.reminder) {
        await sendReminder(sale);
        sale.emailSent.reminder = true;
        store.persistNow();
      }
    }
  }
}
```

## Integração com Store

### Atualização do addSale()

```javascript
// ANTES
function addSale({ ... }) {
  const sale = { ... };
  getDb().sales.push(sale);
  persistNow();
  return sale;
}

// DEPOIS
async function addSale({ ... }) {
  const sale = {
    ...,
    emailSent: {
      purchase: false,
      approval: false,
      reminder: false,
      expiry: false
    }
  };
  getDb().sales.push(sale);
  persistNow();
  
  // Enviar comprovante se tiver e-mail
  if (sale.buyerContact && sale.buyerContact.includes('@')) {
    sendPurchaseReceipt(sale).catch(err => {
      console.error('[email] Falha ao enviar comprovante:', err.message);
    });
  }
  
  return sale;
}
```

### Atualização do updateSale()

```javascript
// Adicionar no updateSale()
if (patch.status === 'pago' && sale.buyerContact) {
  sendApprovalEmail(sale).catch(err => {
    console.error('[email] Falha ao enviar aprovação:', err.message);
  });
  sale.emailSent.approval = true;
}
```

## Variáveis de Ambiente (.env)

```env
# Gmail SMTP
GMAIL_USER=seu-email@gmail.com
GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Configurações de e-mail
EMAIL_FROM="AIMZY <seu-email@gmail.com>"
EMAIL_ENABLED=true
```

## Segurança

1. **App Password**: Usar senha de app do Gmail, não senha normal
2. **Rate Limiting**: Máximo 3 e-mails por dia por cliente
3. **Validação**: Verificar e-mail antes de enviar
4. **Logs**: Registrar todos os envios em audit_log

## Fluxo Completo

```
1. Admin cadastra venda
   └─► addSale() → sendPurchaseReceipt()

2. Admin aprova pagamento
   └─► updateSale(status='pago') → sendApprovalEmail()

3. Scheduler roda a cada hora
   └─► checkExpiringKeys() → sendReminder()
   └─► checkExpiredKeys() → sendExpiryNotification()

4. Falha no envio
   └─► Logar erro → Retry em 5 min → Fila manual
```

## Dependências

```json
{
  "nodemailer": "^6.9.0"
}
```

## Arquivos a Criar

1. `src/email.js` - Serviço principal
2. `src/email-templates.js` - Templates HTML
3. `src/email-scheduler.js` - Agendador de verificações

## Arquivos a Modificar

1. `server.js` - Integrar envio nas rotas de venda
2. `src/store.js` - Adicionar campo emailSent nas vendas
3. `.env` - Adicionar credenciais Gmail
4. `package.json` - Adicionar dependência nodemailer

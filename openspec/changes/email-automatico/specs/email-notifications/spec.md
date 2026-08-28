# Spec: Sistema de Notificações por E-mail

## Overview
Sistema de envio automático de e-mails para o AIMZY, integrado ao fluxo de vendas e KEYs.

## Actors
- **Sistema**: Envia e-mails automaticamente
- **Admin**: Configura e aprova pagamentos
- **Cliente**: Recebe e-mails

## Use Cases

### UC1: Envio de Comprovante de Compra
**Trigger**: Admin cadastra venda com e-mail do cliente
**Flow**:
1. Admin preenche formulário de venda com `buyerContact` (e-mail)
2. Sistema gera KEY e registra venda
3. Sistema envia e-mail com comprovante
4. E-mail contém: código da KEY, plano, duração, valor, instruções

### UC2: Aprovação de Pagamento
**Trigger**: Admin muda status da venda para "pago"
**Flow**:
1. Admin clica "Aprovar" na venda
2. Sistema atualiza status para "pago"
3. Sistema envia e-mail de confirmação
4. E-mail contém: KEY ativada, data de expiração, como usar

### UC3: Lembrete antes da Expiração
**Trigger**: Verificação periódica (a cada hora)
**Flow**:
1. Sistema verifica KEYs que expiram em 24h
2. Para cada KEY encontrada, envia lembrete
3. E-mail contém: tempo restante, como renovar, link de contato

### UC4: Notificação de Expiração
**Trigger**: Verificação periódica (a cada hora)
**Flow**:
1. Sistema verifica KEYs expiradas nas últimas 24h
2. Para cada KEY expirada, envia notificação
3. E-mail contém: KEY expirou, como renovar, benefícios

## Business Rules

### BR1: Limite de Envio
- Máximo 1 e-mail por evento por KEY
- Não enviar mais de 3 e-mails por dia por cliente

### BR2: Horário de Envio
- E-mails de expiração: apenas entre 8h e 22h (horário do cliente)
- Lembrete: enviar no horário mais provável de leitura (10h-14h)

### BR3: Templates
- Todos os e-mails em HTML responsivo
- Logo AIMZY no cabeçalho
- Cores: vermelho (#dc2626), fundo escuro (#080404)
- Versão texto simples incluída

## Data Model

### Sale (campos adicionais)
```javascript
{
  buyerContact: string,    // e-mail do cliente
  emailSent: {
    purchase: boolean,     // comprovante enviado
    approval: boolean,     // aprovação enviado
    reminder: boolean,     // lembrete enviado
    expiry: boolean        // expiração enviado
  },
  emailLastSentAt: string  // último e-mail enviado
}
```

## Integration Points

### Gmail SMTP
- Service: Gmail
- Port: 465 (SSL) ou 587 (TLS)
- Auth: App Password (não senha normal)

### Store
- `addSale()`: Enviar comprovante
- `updateSale()`: Enviar aprovação
- `isKeyExpired()`: Verificar expiração

## Templates

### 1. Comprovante de Compra
```
Assunto: 🎮 AIMZY - Comprovante da sua compra

Olá [Nome]!

Sua compra foi registrada com sucesso!

📋 DETALHES:
- KEY: [código]
- Plano: [plano]
- Duração: [duração]
- Valor: R$ [valor]
- Data: [data]

⏳ PRÓXIMO PASSO:
Aguarde a aprovação do pagamento. Você receberá um e-mail assim que for confirmado.

Precisa de ajuda? Responda este e-mail ou fale conosco pelo WhatsApp.
```

### 2. Aprovação de Pagamento
```
Assunto: ✅ AIMZY - Pagamento Aprovado!

Olá [Nome]!

Seu pagamento foi aprovado e sua KEY está ativa!

🔑 SUA KEY: [código]
📅 Válida até: [data expiração]

📱 COMO USAR:
1. Acesse aimzy.com
2. Clique em "Ativar KEY"
3. Digite o código acima

🎮 Aproveite todas as funcionalidades VIP!

Dica: Não compartilhe sua KEY. Ela é pessoal e intransferível.
```

### 3. Lembrete antes da Expiração
```
Assunto: ⏰ AIMZY - Sua KEY expira em breve!

Olá [Nome]!

Sua KEY VIP expira em [tempo restante].

🔑 SUA KEY: [código]
📅 Expira em: [data/hora]

💡 RENOVE AGORA:
Para continuar usando o AIMZY sem interrupção, renove sua KEY.

[Botão: RENOVAR AGORA]

Não perca suas configurações salvas e seu histórico!
```

### 4. Notificação de Expiração
```
Assunto: ❌ AIMZY - Sua KEY expirou

Olá [Nome]!

Sua KEY VIP expirou em [data].

🔒 ACESSO RESTRITO:
Algumas funcionalidades foram bloqueadas.

🔄 PARA RENOVAR:
Fale com um administrador ou acesse nosso canal de vendas.

[Botão: RENOVAR KEY]

Sua conta e dados estão seguros. Basta ativar uma nova KEY para voltar a usar tudo.
```

## Error Handling
- Falha no envio: logar erro, não bloquear operação
- Retry: 3 tentativas com intervalo de 5 min
- Fallback: salvar e-mail na fila para envio manual

## Security
- Nunca enviar senha por e-mail
- KEYs são códigos, não senhas
- Rate limiting por e-mail (máx 3/dia)

# Tasks: Sistema de E-mails Automáticos

## Pré-requisitos
- [ ] Criar conta Gmail para o projeto
- [ ] Gerar App Password no Gmail
- [ ] Configurar variáveis de ambiente

## Fase 1: Infraestrutura

### T1.1: Instalar dependência
- [ ] Rodar `npm install nodemailer`
- [ ] Adicionar no package.json

### T1.2: Configurar variáveis de ambiente
- [ ] Adicionar no .env:
  ```
  GMAIL_USER=aimzy-oficial@gmail.com
  GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
  EMAIL_FROM="AIMZY <aimzy-oficial@gmail.com>"
  EMAIL_ENABLED=true
  ```

### T1.3: Criar src/email.js
- [ ] Configurar transporter Gmail SMTP
- [ ] Criar função sendPurchaseReceipt()
- [ ] Criar função sendApprovalEmail()
- [ ] Criar função sendReminder()
- [ ] Criar função sendExpiryNotification()
- [ ] Implementar fila de retry (3 tentativas)
- [ ] Adicionar rate limiting por e-mail

### T1.4: Criar src/email-templates.js
- [ ] Template purchaseReceipt() - HTML responsivo
- [ ] Template approvalEmail() - HTML responsivo
- [ ] Template reminderEmail() - HTML responsivo
- [ ] Template expiryEmail() - HTML responsivo
- [ ] Estilo: fundo #080404, texto #f5f0ee, destaque #dc2626
- [ ] Incluir logo AIMZY no cabeçalho
- [ ] Versão texto simples para fallback

### T1.5: Criar src/email-scheduler.js
- [ ] Função startScheduler() - inicia intervalos
- [ ] Função checkExpiringKeys() - verifica KEYs em 24h
- [ ] Função checkExpiredKeys() - verifica KEYs expiradas
- [ ] Controle de execução (não enviar duplicado)
- [ ] Integração com store para marcar envios

## Fase 2: Integração com Store

### T2.1: Atualizar store.js - addSale()
- [ ] Adicionar campo emailSent no objeto venda
- [ ] Chamar sendPurchaseReceipt() após salvar
- [ ] Tratar erros sem bloquear operação

### T2.2: Atualizar store.js - updateSale()
- [ ] Detectar mudança para status='pago'
- [ ] Chamar sendApprovalEmail() quando aprovado
- [ ] Marcar emailSent.approval = true

### T2.3: Adicionar funções auxiliares
- [ ] findSaleByKeyId() - buscar venda pela KEY
- [ ] canSendEmail(sale, type) - verificar rate limiting
- [ ] markEmailSent(sale, type) - marcar envio

## Fase 3: Integração com Server

### T3.1: Atualizar server.js - Rota POST /api/admin/sales
- [ ] Importar módulo email
- [ ] Chamar sendPurchaseReceipt() após criar venda
- [ ] Log de envio em audit_log

### T3.2: Atualizar server.js - Rota PUT /api/admin/sales/:id
- [ ] Detectar mudança de status
- [ ] Chamar sendApprovalEmail() quando aprovado
- [ ] Log de envio em audit_log

### T3.3: Atualizar server.js - Inicialização
- [ ] Importar email-scheduler
- [ ] Chamar startScheduler() no boot
- [ ] Log de agendamento

### T3.4: Criar rota de teste (opcional)
- [ ] POST /api/admin/test-email
- [ ] Enviar e-mail de teste para verificar configuração

## Fase 4: Templates e Design

### T4.1: Template - Comprovante de Compra
- [ ] Cabeçalho com logo AIMZY
- [ ] Seção "Detalhes da Compra"
- [ ] Código da KEY em destaque
- [ ] Instruções de próximos passos
- [ ] Rodapé com contato

### T4.2: Template - Aprovação de Pagamento
- [ ] Cabeçalho com logo AIMZY
- [ ] Mensagem de confirmação
- [ ] KEY ativada em destaque
- [ ] Data de expiração
- [ ] Instruções de uso

### T4.3: Template - Lembrete
- [ ] Cabeçalho com logo AIMZY
- [ ] Tempo restante em destaque
- [ ] Botão "Renovar Agora"
- [ ] Benefícios de renovar

### T4.4: Template - Expiração
- [ ] Cabeçalho com logo AIMZY
- [ ] Mensagem de expiração
- [ ] Como renovar
- [ ] Botão "Renovar KEY"

## Fase 5: Testes

### T5.1: Teste unitário - email.js
- [ ] Testar envio com credenciais válidas
- [ ] Testar tratamento de erros
- [ ] Testar rate limiting

### T5.2: Teste de integração
- [ ] Testar fluxo completo: venda → comprovante
- [ ] Testar fluxo: aprovação → e-mail
- [ ] Testar scheduler: lembrete antes de expirar

### T5.3: Teste manual
- [ ] Cadastrar venda com e-mail válido
- [ ] Verificar recebimento do comprovante
- [ ] Aprovar pagamento
- [ ] Verificar recebimento da aprovação

## Fase 6: Deploy

### T6.1: Configurar no Render
- [ ] Adicionar variáveis de ambiente
- [ ] Verificar se nodemailer funciona

### T6.2: Monitoramento
- [ ] Logs de envio em audit_log
- [ ] Dashboard de e-mails enviados
- [ ] Alertas de falha

## Ordem de Execução

1. **T1.1** → Instalar nodemailer
2. **T1.2** → Configurar .env
3. **T1.4** → Criar templates HTML
4. **T1.3** → Criar serviço de e-mail
5. **T1.5** → Criar agendador
6. **T2.1** → Atualizar addSale()
7. **T2.2** → Atualizar updateSale()
8. **T3.1** → Integrar com server.js
9. **T3.3** → Iniciar scheduler no boot
10. **T5.3** → Testar manualmente

## Estimativa de Tempo

| Fase | Tempo |
|------|-------|
| Fase 1: Infraestrutura | 2h |
| Fase 2: Store | 1h |
| Fase 3: Server | 1h |
| Fase 4: Templates | 2h |
| Fase 5: Testes | 1h |
| Fase 6: Deploy | 30min |
| **Total** | **7h30** |

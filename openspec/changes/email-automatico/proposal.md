# Proposal: Sistema de E-mails Automáticos

## What
Implementar sistema de envio automático de e-mails para:
1. **Comprovante de compra** - Enviar comprovante quando o cliente compra uma KEY
2. **Aprovação de pagamento** - Enviar confirmação quando o admin aprova
3. **Antes de expirar** - Lembrete 24h antes da KEY expirar
4. **Na expiração** - Notificar quando a KEY expirar

## Why
- **Profissionalismo**: Clientes recebem comprovantes automáticos
- **Retenção**: Lembretes antes da expiração incentivam renovação
- **Transparência**: Clientes são informados sobre o status da compra
- **Autonomia**: Admin não precisa enviar manualmente

## Scope
- Integrar Nodemailer com Gmail
- Criar templates HTML profissionais
- Agendar verificações periódicas de expiração
- Salvar status de envio nas vendas

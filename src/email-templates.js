'use strict';

const COLORS = {
  bg: '#080404',
  card: '#1a0d0d',
  text: '#f5f0ee',
  muted: '#a89f9c',
  red: '#dc2626',
  redLight: '#f87171',
  green: '#22c55e',
  gold: '#f59e0b',
  border: 'rgba(255,255,255,0.09)'
};

function baseTemplate(title, content) {
  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${COLORS.bg};color:${COLORS.text};font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:20px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
          
          <!-- HEADER -->
          <tr>
            <td style="padding:30px 40px;background:linear-gradient(135deg,#7f1d1d,#dc2626);border-radius:20px 20px 0 0;text-align:center;">
              <div style="font-size:32px;margin-bottom:8px;">🎯</div>
              <h1 style="margin:0;font-size:24px;color:#fff;letter-spacing:2px;">AIMZY</h1>
              <p style="margin:5px 0 0;font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:3px;text-transform:uppercase;">FREE FIRE SENSIBILIDADE</p>
            </td>
          </tr>
          
          <!-- CONTENT -->
          <tr>
            <td style="padding:35px 40px;background:${COLORS.card};border-left:1px solid ${COLORS.border};border-right:1px solid ${COLORS.border};">
              ${content}
            </td>
          </tr>
          
          <!-- FOOTER -->
          <tr>
            <td style="padding:25px 40px;background:#0d0707;border-radius:0 0 20px 20px;border:1px solid ${COLORS.border};border-top:none;text-align:center;">
              <p style="margin:0;font-size:12px;color:${COLORS.muted};line-height:1.6;">
                <b style="color:${COLORS.text};">AIMZY</b> — Ferramenta feita pela comunidade<br>
                Não afiliado à Garena / Free Fire
              </p>
              <p style="margin:12px 0 0;font-size:11px;color:${COLORS.muted};">
                Precisa de ajuda? Responda este e-mail
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function purchaseReceipt({ buyerLabel, keyCode, plan, duration, price, soldAt }) {
  const content = `
    <div style="text-align:center;margin-bottom:25px;">
      <div style="font-size:48px;margin-bottom:10px;">📋</div>
      <h2 style="margin:0;font-size:20px;color:${COLORS.text};">Comprovante de Compra</h2>
      <p style="margin:8px 0 0;color:${COLORS.muted};font-size:14px;">Sua compra foi registrada com sucesso!</p>
    </div>
    
    <div style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:12px;padding:20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;">Cliente</td>
          <td style="padding:8px 0;color:${COLORS.text};font-size:13px;text-align:right;font-weight:600;">${buyerLabel || 'Não informado'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;border-top:1px solid rgba(255,255,255,0.05);">Plano</td>
          <td style="padding:8px 0;color:${COLORS.gold};font-size:13px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${plan || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;border-top:1px solid rgba(255,255,255,0.05);">Duração</td>
          <td style="padding:8px 0;color:${COLORS.text};font-size:13px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${duration || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;border-top:1px solid rgba(255,255,255,0.05);">Valor</td>
          <td style="padding:8px 0;color:${COLORS.green};font-size:16px;text-align:right;font-weight:700;border-top:1px solid rgba(255,255,255,0.05);">R$ ${(Number(price) || 0).toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;border-top:1px solid rgba(255,255,255,0.05);">Data</td>
          <td style="padding:8px 0;color:${COLORS.text};font-size:13px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${soldAt ? new Date(soldAt).toLocaleString('pt-BR') : 'N/A'}</td>
        </tr>
      </table>
    </div>
    
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:16px;margin-bottom:20px;">
      <p style="margin:0;color:${COLORS.gold};font-size:13px;font-weight:600;">⏳ PRÓXIMO PASSO</p>
      <p style="margin:8px 0 0;color:${COLORS.muted};font-size:13px;line-height:1.5;">
        Aguarde a aprovação do pagamento. Você receberá um e-mail assim que for confirmado.
      </p>
    </div>
    
    <p style="margin:0;color:${COLORS.muted};font-size:12px;text-align:center;">
      Precisa de ajuda? Responda este e-mail ou fale conosco.
    </p>`;

  return {
    subject: '🎮 AIMZY - Comprovante da sua compra',
    html: baseTemplate('Comprovante de Compra', content),
    text: `AIMZY - Comprovante de Compra\n\nCliente: ${buyerLabel}\nPlano: ${plan}\nDuração: ${duration}\nValor: R$ ${(Number(price) || 0).toFixed(2)}\nData: ${soldAt ? new Date(soldAt).toLocaleString('pt-BR') : 'N/A'}\n\nAguarde a aprovação do pagamento.`
  };
}

function approvalEmail({ buyerLabel, keyCode, plan, expiresAt }) {
  const content = `
    <div style="text-align:center;margin-bottom:25px;">
      <div style="font-size:48px;margin-bottom:10px;">✅</div>
      <h2 style="margin:0;font-size:20px;color:${COLORS.green};">Pagamento Aprovado!</h2>
      <p style="margin:8px 0 0;color:${COLORS.muted};font-size:14px;">Sua KEY está ativa e pronta para uso</p>
    </div>
    
    <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 8px;color:${COLORS.muted};font-size:12px;text-transform:uppercase;letter-spacing:2px;">Sua KEY</p>
      <p style="margin:0;font-size:20px;color:${COLORS.green};font-weight:700;font-family:monospace;letter-spacing:2px;">${keyCode}</p>
    </div>
    
    <div style="background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:12px;padding:20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;">Plano</td>
          <td style="padding:8px 0;color:${COLORS.gold};font-size:13px;text-align:right;font-weight:600;">${plan || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:${COLORS.muted};font-size:13px;border-top:1px solid rgba(255,255,255,0.05);">Válida até</td>
          <td style="padding:8px 0;color:${COLORS.text};font-size:13px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${expiresAt ? new Date(expiresAt).toLocaleString('pt-BR') : 'Permanente'}</td>
        </tr>
      </table>
    </div>
    
    <div style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:12px;padding:20px;margin-bottom:20px;">
      <p style="margin:0 0 12px;color:${COLORS.redLight};font-size:14px;font-weight:700;">📱 COMO USAR</p>
      <p style="margin:0 0 8px;color:${COLORS.muted};font-size:13px;line-height:1.6;">
        1. Acesse <b style="color:${COLORS.text};">aimzy.com</b><br>
        2. Clique em <b style="color:${COLORS.text};">"Ativar KEY"</b><br>
        3. Digite o código acima
      </p>
    </div>
    
    <p style="margin:0;color:${COLORS.muted};font-size:12px;text-align:center;">
      🎮 Aproveite todas as funcionalidades VIP!<br>
      <b style="color:${COLORS.redLight};">Dica:</b> Não compartilhe sua KEY. Ela é pessoal e intransferível.
    </p>`;

  return {
    subject: '✅ AIMZY - Pagamento Aprovado! Sua KEY está ativa',
    html: baseTemplate('Pagamento Aprovado', content),
    text: `AIMZY - Pagamento Aprovado!\n\nSua KEY: ${keyCode}\nPlano: ${plan}\nVálida até: ${expiresAt ? new Date(expiresAt).toLocaleString('pt-BR') : 'Permanente'}\n\nComo usar:\n1. Acesse aimzy.com\n2. Clique em "Ativar KEY"\n3. Digite o código acima`
  };
}

function reminderEmail({ buyerLabel, keyCode, plan, expiresAt }) {
  const now = Date.now();
  const expTime = new Date(expiresAt).getTime();
  const diff = expTime - now;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const timeLeft = hours > 0 ? `${hours}h ${minutes}min` : `${minutes} minutos`;

  const content = `
    <div style="text-align:center;margin-bottom:25px;">
      <div style="font-size:48px;margin-bottom:10px;">⏰</div>
      <h2 style="margin:0;font-size:20px;color:${COLORS.gold};">Sua KEY expira em breve!</h2>
      <p style="margin:8px 0 0;color:${COLORS.muted};font-size:14px;">Renove para continuar usando sem interrupção</p>
    </div>
    
    <div style="background:rgba(245,158,11,0.15);border:1px solid rgba(245,158,11,0.4);border-radius:12px;padding:20px;margin-bottom:20px;text-align:center;">
      <p style="margin:0 0 8px;color:${COLORS.muted};font-size:12px;text-transform:uppercase;letter-spacing:2px;">Tempo Restante</p>
      <p style="margin:0;font-size:28px;color:${COLORS.gold};font-weight:700;">${timeLeft}</p>
    </div>
    
    <div style="background:${COLORS.bg};border:1px solid ${COLORS.border};border-radius:12px;padding:16px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:${COLORS.muted};font-size:12px;">Sua KEY</td>
          <td style="padding:6px 0;color:${COLORS.text};font-size:12px;text-align:right;font-weight:600;font-family:monospace;">${keyCode}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:${COLORS.muted};font-size:12px;border-top:1px solid rgba(255,255,255,0.05);">Plano</td>
          <td style="padding:6px 0;color:${COLORS.gold};font-size:12px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${plan || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:${COLORS.muted};font-size:12px;border-top:1px solid rgba(255,255,255,0.05);">Expira em</td>
          <td style="padding:6px 0;color:${COLORS.redLight};font-size:12px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${new Date(expiresAt).toLocaleString('pt-BR')}</td>
        </tr>
      </table>
    </div>
    
    <div style="text-align:center;margin-bottom:15px;">
      <a href="#" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#b91c1c,#dc2626);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">RENOVAR AGORA</a>
    </div>
    
    <p style="margin:0;color:${COLORS.muted};font-size:12px;text-align:center;">
      💡 Não perca suas configurações salvas e seu histórico!
    </p>`;

  return {
    subject: `⏰ AIMZY - Sua KEY expira em ${timeLeft}`,
    html: baseTemplate('Lembrete de Expiração', content),
    text: `AIMZY - Sua KEY expira em breve!\n\nTempo restante: ${timeLeft}\nSua KEY: ${keyCode}\nPlano: ${plan}\nExpira em: ${new Date(expiresAt).toLocaleString('pt-BR')}\n\nRenove para continuar usando.`
  };
}

function expiryEmail({ buyerLabel, keyCode, plan, expiredAt }) {
  const content = `
    <div style="text-align:center;margin-bottom:25px;">
      <div style="font-size:48px;margin-bottom:10px;">❌</div>
      <h2 style="margin:0;font-size:20px;color:${COLORS.redLight};">Sua KEY expirou</h2>
      <p style="margin:8px 0 0;color:${COLORS.muted};font-size:14px;">O acesso VIP foi encerrado</p>
    </div>
    
    <div style="background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:12px;padding:20px;margin-bottom:20px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:6px 0;color:${COLORS.muted};font-size:12px;">KEY</td>
          <td style="padding:6px 0;color:${COLORS.text};font-size:12px;text-align:right;font-weight:600;font-family:monospace;">${keyCode}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:${COLORS.muted};font-size:12px;border-top:1px solid rgba(255,255,255,0.05);">Plano</td>
          <td style="padding:6px 0;color:${COLORS.gold};font-size:12px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${plan || 'N/A'}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:${COLORS.muted};font-size:12px;border-top:1px solid rgba(255,255,255,0.05);">Expirou em</td>
          <td style="padding:6px 0;color:${COLORS.redLight};font-size:12px;text-align:right;font-weight:600;border-top:1px solid rgba(255,255,255,0.05);">${expiredAt ? new Date(expiredAt).toLocaleString('pt-BR') : 'N/A'}</td>
        </tr>
      </table>
    </div>
    
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:16px;margin-bottom:20px;">
      <p style="margin:0 0 8px;color:${COLORS.gold};font-size:13px;font-weight:600;">🔒 ACESSO RESTRITO</p>
      <p style="margin:0;color:${COLORS.muted};font-size:13px;line-height:1.5;">
        Algumas funcionalidades foram bloqueadas. Para voltar a usar tudo, renove sua KEY.
      </p>
    </div>
    
    <div style="text-align:center;margin-bottom:15px;">
      <a href="#" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#b91c1c,#dc2626);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:14px;">RENOVAR KEY</a>
    </div>
    
    <p style="margin:0;color:${COLORS.muted};font-size:12px;text-align:center;">
      🔄 Sua conta e dados estão seguros.<br>
      Basta ativar uma nova KEY para voltar a usar tudo.
    </p>`;

  return {
    subject: '❌ AIMZY - Sua KEY expirou',
    html: baseTemplate('KEY Expirada', content),
    text: `AIMZY - Sua KEY expirou\n\nKEY: ${keyCode}\nPlano: ${plan}\nExpirou em: ${expiredAt ? new Date(expiredAt).toLocaleString('pt-BR') : 'N/A'}\n\nPara voltar a usar, renove sua KEY.`
  };
}

module.exports = {
  purchaseReceipt,
  approvalEmail,
  reminderEmail,
  expiryEmail
};

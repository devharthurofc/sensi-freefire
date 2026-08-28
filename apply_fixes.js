const fs = require('fs');

// ===== 1. server.js: remover bloco duplicado de expiresAt no activate =====
{
  const p = 'C:/Users/SnyX/sensi-freefire/server.js';
  let s = fs.readFileSync(p, 'utf8');
  const dup = [
    '    // KEY \'aguardando\' (vinda de venda aprovada): calcular expiresAt',
    '    // AGORA com base na duração. O tempo só começa a contar a partir',
    '    // deste momento em que o cliente está ativando a key no gerador.',
    '    if (key.status === \'aguardando\' || !key.expiresAt) {',
    '      const ms = store.msFromKeyDuration ? store.msFromKeyDuration(key) : null;',
    '      // fallback: tentar via msFromPlan se msFromKeyDuration não existir',
    '      const durMs = ms != null ? ms : (typeof msFromPlan === \'function\' ? msFromPlan(key.plan || key.duration || \'\') : null);',
    '      key.expiresAt = durMs ? new Date(Date.now() + durMs).toISOString() : null;',
    '      key.status = \'ativa\';',
    '    }',
    '',
    '    key.uses += 1;'
  ].join('\n');
  // só remove a segunda ocorrência (a duplicata que sobrescreve key.uses)
  const first = s.indexOf(dup);
  if (first !== -1) {
    const second = s.indexOf(dup, first + 10);
    if (second !== -1) {
      s = s.slice(0, second) + s.slice(second + dup.length);
      fs.writeFileSync(p, s, 'utf8');
      console.log('OK server.js: bloco duplicado removido');
    } else {
      console.log('NAO achou dup server.js (já unico?)');
    }
  } else {
    console.log('NAO achou bloco server.js');
  }
}

// ===== 2. server.js: toUserRow não salvava vipType/vipKeyId/vipSince/vipSource =====
{
  const p = 'C:/Users/SnyX/sensi-freefire/src/store.js';
  let s = fs.readFileSync(p, 'utf8');
  const old = `function toUserRow(u) {
  return {
    id: u.id,
    device_id: u.deviceId,
    label: u.label,
    is_vip: !!u.isVip,
    vip_source: u.vipSource || null,
    vip_key_id: u.vipKeyId || null,
    vip_since: u.vipSince || null,
    created_at: u.createdAt,
    last_seen_at: u.lastSeenAt
  };
}`;
  const neu = `function toUserRow(u) {
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
}`;
  if (s.includes(old)) {
    s = s.replace(old, neu);
    fs.writeFileSync(p, s, 'utf8');
    console.log('OK store.js: toUserRow agora salva vip_type');
  } else {
    console.log('NAO achou toUserRow em store.js');
  }
}

// ===== 3. server.js: refreshUserVip só aceita 'ativa', não 'aguardando' =====
{
  const p = 'C:/Users/SnyX/sensi-freefire/server.js';
  let s = fs.readFileSync(p, 'utf8');
  const old = `  if (
    !key ||
    key.status !== 'ativa' ||
    store.isKeyExpired(key)
  ) {`;
  const neu = `  if (
    !key ||
    (key.status !== 'ativa' && key.status !== 'aguardando') ||
    store.isKeyExpired(key)
  ) {`;
  if (s.includes(old)) {
    s = s.replace(old, neu);
    fs.writeFileSync(p, s, 'utf8');
    console.log('OK server.js: refreshUserVip aceita keys aguardando');
  } else {
    console.log('NAO achou refreshUserVip em server.js');
  }
}

console.log('TODOS OS PATCHES APLICADOS');

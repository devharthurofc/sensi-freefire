'use strict';

const { findDevice } = require('./devices');

const MAX_SENSI = 200;
const MIN_SENSI = 40;

/* ================== helpers ================== */

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function jitter(n, j) { j = j == null ? 2 : j; return n + rand(-j, j); }

const STYLE_BASE = {
  eq: { geral: 178, redDot: 172, mira2x: 162, mira4x: 150, miraAwm: 128, olhadinha: 118 },
  ag: { geral: 190, redDot: 184, mira2x: 174, mira4x: 158, miraAwm: 134, olhadinha: 132 },
  pr: { geral: 166, redDot: 160, mira2x: 152, mira4x: 144, miraAwm: 122, olhadinha: 104 }
};

const AIM_ADJ = {
  cabeca: { geral: 8, redDot: 7, mira2x: 5, mira4x: 2, miraAwm: -4, olhadinha: 10 },
  equilibrada: { geral: 0, redDot: 0, mira2x: 0, mira4x: 0, miraAwm: 0, olhadinha: 0 },
  precisao: { geral: -8, redDot: -6, mira2x: -4, mira4x: -2, miraAwm: 4, olhadinha: -8 }
};

const LEVEL_ADJ = {
  iniciante: -4,
  intermediario: 0,
  avancado: 5,
  competitivo: 8
};

const DEFAULT_DPI = [420, 520];

/* ================== ajuste por tier ==================
 * normal   -> sensi equilibrada para começar (ajustes suaves)
 * premium  -> sensi refinada com todas as preferências do jogador
 * proibida -> sensi AGRESSIVA: drag mais rápido, olhadinha alta, botão menor
 */

const TIER_TUNING = {
  normal: {
    label: 'Sensi Normal',
    global: -6, jitter: 3, aimScale: 0.5,
    dpiShift: [0, 0],
    btn: [58, 66]
  },
  premium: {
    label: 'Sensi Premium',
    global: 0, jitter: 3, aimScale: 1,
    dpiShift: [0, 20],
    btn: [52, 62]
  },
  proibida: {
    label: 'Sensi Proibida',
    global: 4, jitter: 4, aimScale: 1,
    dpiShift: [15, 40],
    btn: [46, 56],
    extra: { geral: 8, redDot: 8, mira2x: 4, mira4x: 1, miraAwm: -6, olhadinha: 14 }
  }
};

function buildValues(base, combinedAdj, opts) {
  const out = {};
  for (const k of Object.keys(base)) {
    const v = base[k]
      + (combinedAdj && combinedAdj[k] ? combinedAdj[k] : 0)
      + (opts.globalAdj || 0)
      + (opts.dpiComp || 0);
    out[k] = clamp(jitter(v, opts.jitter), MIN_SENSI, MAX_SENSI);
  }
  return out;
}

function computeDpi(device, dpiAtual, dpiShift) {
  const range = device ? device.dpi.slice() : DEFAULT_DPI.slice();
  let dpi = rand(range[0], range[1]);
  if (dpiAtual && Number(dpiAtual) > 100 && Number(dpiAtual) <= 1200) {
    const cur = parseInt(dpiAtual, 10);
    dpi = clamp(Math.round(cur * 0.55 + dpi * 0.45), range[0], range[1]);
  }
  if (dpiShift && (dpiShift[0] || dpiShift[1])) {
    dpi = clamp(dpi + rand(dpiShift[0], dpiShift[1]), 380, 650);
  }
  return dpi;
}

/**
 * Três opções de DPI para o jogador escolher:
 *   baixa       -> conforto/controle (~240-430; sensi sobe p/ compensar)
 *   equilibrada -> recomendação principal
 *   alta        -> resposta rápida (~640-1050, ex: 800/1000; sensi desce p/ compensar)
 * delta = ajuste aplicado em cada valor de sensi ao trocar o DPI.
 */
function buildDpiOptions(equilibrada) {
  const round5 = n => Math.round(n / 5) * 5;
  const alta = clamp(round5(equilibrada * 1.55 + 160), 640, 1050);
  const baixa = clamp(round5(equilibrada * 0.58), 240, 430);
  return {
    baixa: { dpi: baixa, delta: rand(6, 12) },
    equilibrada: { dpi: equilibrada, delta: 0 },
    alta: { dpi: alta, delta: -rand(6, 12) }
  };
}

/**
 * GERADOR UNIFICADO — um único fluxo com 3 tiers:
 *   normal | premium | proibida
 * Usa o modelo do aparelho (banco de perfis quando reconhecido),
 * estilo de jogo, nível, preferência de mira, tela/FPS e DPI atual.
 * iPhones reconhecidos recebem também os CICLOS recomendados.
 */
function generate(data) {
  const tier = TIER_TUNING[data.tier] ? data.tier : 'normal';
  const tune = TIER_TUNING[tier];

  const model = String(data.deviceModel || '').trim();
  if (!model) {
    return { error: true, message: 'Informe o modelo do seu celular para continuar.' };
  }

  const device = findDevice(model);
  const st = STYLE_BASE[data.style] || STYLE_BASE.eq;
  const aimFull = AIM_ADJ[data.aim] || AIM_ADJ.equilibrada;
  const scale = tune.aimScale;

  // preferência de mira escalada pelo tier + perfil do dispositivo + extra do tier
  const combined = {};
  for (const k of Object.keys(AIM_ADJ.equilibrada)) {
    let v = Math.round(aimFull[k] * scale);
    if (device && device.adj && device.adj[k]) v += device.adj[k];
    if (tune.extra && tune.extra[k]) v += tune.extra[k];
    combined[k] = v;
  }

  let globalAdj =
    tune.global +
    (LEVEL_ADJ[data.level] || 0);

  // compensação inversa em relação ao DPI atual informado
  let dpiComp = 0;
  if (data.dpiAtual && Number(data.dpiAtual) >= 200 && Number(data.dpiAtual) <= 1200) {
    const diff = 500 - parseInt(data.dpiAtual, 10);
    dpiComp = clamp(Math.round(diff / 25), -12, 12);
  }

  const values = buildValues(st, combined, { globalAdj, dpiComp, jitter: tune.jitter });
  const dpi = computeDpi(device, data.dpiAtual, tune.dpiShift);
  const dpiOptions = buildDpiOptions(dpi);

  function applyDelta(base, delta) {
    const out = {};
    for (const k of Object.keys(base)) out[k] = clamp(base[k] + delta, MIN_SENSI, MAX_SENSI);
    return out;
  }
  const valuesByDpi = {
    baixa: applyDelta(values, dpiOptions.baixa.delta),
    equilibrada: values,
    alta: applyDelta(values, dpiOptions.alta.delta)
  };

  let btnBase = rand(tune.btn[0], tune.btn[1]);
  if (device) btnBase = rand(device.btn[0], device.btn[1]);
  const fireButton = clamp(
    btnBase + (data.style === 'ag' ? 4 : 0) + (data.aim === 'cabeca' ? 2 : 0) + (tier === 'proibida' ? -3 : 0),
    42,
    78
  );

  const isApple = !!device && device.brand === 'Apple';
  let ciclos = null;
  if (isApple) {
    const baseCiclos = { 1: 4, 2: 7, 3: 9 }[device.tier] || 5;
    ciclos = clamp(
      baseCiclos + (data.aim === 'cabeca' ? 1 : 0) + (data.style === 'ag' ? 1 : 0) - (data.style === 'pr' ? 1 : 0) + rand(-1, 1),
      0,
      10
    );
  }

  const summaries = {
    normal: 'Sensi equilibrada e confortável, ideal para se adaptar sem sustos.',
    premium: 'Sensi refinada com o perfil do dispositivo e suas preferências de jogo.',
    proibida: 'Sensi AGRESSIVA para drag insano — exige treino para dominar o controle.'
  };

  return {
    mode: tier,
    tier,
    tierLabel: tune.label,
    knownDevice: !!device,
    deviceName: device ? device.name : null,
    unknownMessage: device
      ? null
      : 'Modelo não encontrado na nossa base. Usamos as características gerais para gerar uma config personalizada.',
    values,
    valuesByDpi,
    dpiOptions,
    dpi,
    fireButton,
    ciclos,
    summary: summaries[tier]
  };
}

module.exports = { generate, TIERS: Object.keys(TIER_TUNING), TIER_TUNING, MAX_SENSI };

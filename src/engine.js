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

/**
 * GERADOR EMULADOR — gratuito (BlueStacks, GameLoop, LDPlayer, MSI App Player).
 * Recebe: emulador, DPI do mouse, sensibilidade do mouse e estilo de jogo.
 * Devolve: Geral, Red Dot, Mira 2x, Mira 4x, AWM, Sensibilidade X e Y
 * + DPI recomendado do mouse.
 */
const EMULATORS = {
  bluestacks: {
    label: 'BlueStacks',
    base: { geral: 96, redDot: 90, mira2x: 82, mira4x: 72, miraAwm: 62, sensX: 98, sensY: 92 }
  },
  gameloop: {
    label: 'GameLoop',
    base: { geral: 92, redDot: 86, mira2x: 78, mira4x: 68, miraAwm: 58, sensX: 94, sensY: 88 }
  },
  ldplayer: {
    label: 'LDPlayer',
    base: { geral: 94, redDot: 88, mira2x: 80, mira4x: 70, miraAwm: 60, sensX: 96, sensY: 90 }
  },
  msi: {
    label: 'MSI App Player',
    base: { geral: 95, redDot: 89, mira2x: 81, mira4x: 71, miraAwm: 61, sensX: 97, sensY: 91 }
  }
};

const EMU_STYLE_DELTA = {
  geral: 5, redDot: 5, mira2x: 4, mira4x: 3, miraAwm: -2, sensX: 5, sensY: 4
};

/*
 * Presets de emulador (configs consagradas / base conhecida).
 * Aplicam a base inteira e sobrepõem a base padrão do emulador.
 */
const EMU_PRESETS = {
  padrao: {
    label: 'Padrão',
    base: { geral: 90, redDot: 85, mira2x: 78, mira4x: 68, miraAwm: 60, sensX: 90, sensY: 84 }
  },
  confortavel: {
    label: 'Confortável',
    base: { geral: 80, redDot: 76, mira2x: 70, mira4x: 62, miraAwm: 54, sensX: 82, sensY: 76 }
  },
  casual: {
    label: 'Casual',
    base: { geral: 86, redDot: 82, mira2x: 76, mira4x: 66, miraAwm: 58, sensX: 88, sensY: 82 }
  },
  hipico: {
    label: 'Hípico (drag)',
    base: { geral: 100, redDot: 95, mira2x: 86, mira4x: 74, miraAwm: 64, sensX: 100, sensY: 92 }
  },
  sensivel: {
    label: 'Sensível',
    base: { geral: 108, redDot: 102, mira2x: 92, mira4x: 80, miraAwm: 70, sensX: 106, sensY: 98 }
  }
};

function generateEmulator(data) {
  const emuKey = EMULATORS[data.emulator] ? data.emulator : 'bluestacks';
  const emu = EMULATORS[emuKey];

  // aplica o preset escolhido (se existir) como base
  const presetKey = EMU_PRESETS[data.preset] ? data.preset : null;
  const base = presetKey ? EMU_PRESETS[presetKey].base : emu.base;

  const styleAdj = data.style === 'ag' ? 1 : (data.style === 'pr' ? -1 : 0);

  // compensação pela DPI do mouse: mouse rápido -> sensi menor
  let dpiComp = 0;
  const mouseDpi = parseInt(data.mouseDpi, 10);
  if (Number.isInteger(mouseDpi) && mouseDpi >= 100 && mouseDpi <= 16000) {
    dpiComp = clamp(Math.round((800 - mouseDpi) / 40), -14, 14);
  }

  // sensibilidade do mouse informada pelo jogador (escala típica 0.5 - 100)
  const mouseSens = parseFloat(data.mouseSens);
  const sensComp = Number.isFinite(mouseSens) && mouseSens > 0
    ? clamp(Math.round((25 - Math.min(mouseSens, 100)) / 4), -10, 10)
    : 0;

  const values = {};
  for (const k of Object.keys(base)) {
    const v = base[k] + styleAdj * EMU_STYLE_DELTA[k] + dpiComp + sensComp;
    values[k] = clamp(jitter(v, 2), 1, 200);
  }

  const dpi = Number.isInteger(mouseDpi) && mouseDpi >= 100 && mouseDpi <= 16000
    ? clamp(Math.round(mouseDpi / 10) * 10, 400, 1200)
    : 800;

  return {
    mode: 'emulador',
    emulator: emuKey,
    emulatorLabel: emu.label,
    preset: presetKey,
    presetLabel: presetKey ? EMU_PRESETS[presetKey].label : null,
    values,
    dpi,
    fireButton: null,
    summary: 'Config para ' + emu.label
      + (presetKey ? ' · preset "' + EMU_PRESETS[presetKey].label + '"' : '')
      + ' ajustada ao seu mouse e estilo. Treine antes das ranqueadas.'
  };
}

module.exports = {
  generate,
  generateEmulator,
  EMULATORS,
  EMULATOR_KEYS: Object.keys(EMULATORS),
  EMU_PRESETS,
  EMU_PRESET_KEYS: Object.keys(EMU_PRESETS),
  TIERS: Object.keys(TIER_TUNING),
  TIER_TUNING,
  MAX_SENSI
};

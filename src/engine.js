'use strict';

const { findDevice } = require('./devices');

const MAX_SENSI = 200;
const MIN_SENSI = 40;

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function rand(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
function jitter(n) { return n + rand(-2, 2); }

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

const HZ_ADJ = { '60': 3, '90': 0, '120': -3, '144': -5 };
const FPS_ADJ = { '30': 4, '60': 0, '90': -2, '120': -4 };

const RAM_DPI = { '2': [380, 440], '3': [400, 480], '4': [430, 520], '6': [460, 560], '8': [500, 620] };
const RAM_SENSI = { '2': 5, '3': 3, '4': 0, '6': -3, '8': -5 };

const BRAND_FALLBACK = {
  samsung: { dpi: [420, 510], adj: 0 },
  xiaomi: { dpi: [440, 540], adj: 4 },
  motorola: { dpi: [390, 470], adj: 1 },
  apple: { dpi: [450, 550], adj: 4 },
  realme: { dpi: [420, 520], adj: 3 },
  asus: { dpi: [470, 590], adj: 6 },
  outro: { dpi: [400, 500], adj: 0 }
};

function buildValues(base, extraAdj, opts) {
  const out = {};
  for (const k of Object.keys(base)) {
    let v = base[k]
      + (extraAdj && extraAdj[k] ? extraAdj[k] : 0)
      + (opts.globalAdj || 0)
      + (opts.dpiComp || 0);
    out[k] = clamp(jitter(v), MIN_SENSI, MAX_SENSI);
  }
  return out;
}

function computeDpi(device, ram, dpiAtual) {
  let range;
  if (device) range = device.dpi.slice();
  else if (ram && RAM_DPI[ram]) range = RAM_DPI[ram].slice();
  else range = [420, 520];

  let dpi = rand(range[0], range[1]);
  if (dpiAtual && Number(dpiAtual) > 100 && Number(dpiAtual) <= 1200) {
    const cur = parseInt(dpiAtual, 10);
    // aproxima do DPI atual dentro da faixa segura recomendada
    const lo = range[0], hi = range[1];
    dpi = clamp(Math.round((cur * 0.55) + (dpi * 0.45)), lo, hi);
  }
  return dpi;
}

/**
 * MODO FREE — configuração básica.
 * Exige modelo do celular; usa apenas dados básicos.
 */
function generateFree({ deviceModel, ram, style }) {
  const device = findDevice(deviceModel);
  const st = STYLE_BASE[style] || STYLE_BASE.eq;
  const ramKey = String(ram || '4');
  const globalAdj = (RAM_SENSI[ramKey] || 0) + rand(-3, 3);

  const values = buildValues(st, null, { globalAdj });
  const dpi = computeDpi(device, ramKey, null);
  const fireButton = rand(58, 66);

  return {
    mode: 'free',
    knownDevice: !!device,
    deviceName: device ? device.name : null,
    values,
    dpi,
    fireButton,
    summary: 'Configuração básica gerada a partir das informações informadas.'
  };
}

/**
 * MODO VIP — configuração mais detalhada e mais opções de personalização.
 */
function generateVip({ brand, ram, refreshHz, fps, style, level, aim, dpiAtual }) {
  const st = STYLE_BASE[style] || STYLE_BASE.eq;
  const aimAdj = AIM_ADJ[aim] || AIM_ADJ.equilibrada;
  const ramKey = String(ram || '4');
  const hzKey = String(refreshHz || '60');
  const fpsKey = String(fps || '60');

  const globalAdj =
    (RAM_SENSI[ramKey] || 0) +
    (HZ_ADJ[hzKey] || 0) +
    (FPS_ADJ[fpsKey] || 0) +
    (LEVEL_ADJ[level] || 0) +
    rand(-2, 3);

  const values = buildValues(st, aimAdj, { globalAdj });
  const b = BRAND_FALLBACK[(brand || 'outro').toLowerCase()] || BRAND_FALLBACK.outro;

  let dpiRange = b.dpi.slice();
  if (RAM_DPI[ramKey]) {
    dpiRange[0] = Math.max(dpiRange[0], RAM_DPI[ramKey][0]);
    dpiRange[1] = Math.min(Math.max(dpiRange[1], RAM_DPI[ramKey][0]), Math.max(RAM_DPI[ramKey][1], dpiRange[1]));
  }
  let dpi = rand(dpiRange[0], dpiRange[1]);
  if (dpiAtual && Number(dpiAtual) > 100 && Number(dpiAtual) <= 1200) {
    const cur = parseInt(dpiAtual, 10);
    dpi = clamp(Math.round(cur * 0.5 + dpi * 0.5), dpiRange[0], dpiRange[1]);
  }

  const fireButton = clamp(rand(50, 62) + (style === 'ag' ? 4 : 0) + (aim === 'cabeca' ? 2 : 0), 45, 75);

  return {
    mode: 'vip',
    knownDevice: false,
    deviceName: null,
    values,
    dpi,
    fireButton,
    summary: 'Configuração detalhada gerada com base no seu perfil de jogo.'
  };
}

/**
 * MODO GERADO VIP — o mais avançado. Exige MODELO DO CELULAR.
 * Usa o banco de perfis de dispositivos quando o modelo é reconhecido.
 */
function generateGerado(data) {
  if (!data || !String(data.deviceModel || '').trim()) {
    return { error: true, message: 'Informe o modelo do seu celular para continuar.' };
  }

  const device = findDevice(data.deviceModel);
  const st = STYLE_BASE[data.style] || STYLE_BASE.eq;
  const aimAdj = AIM_ADJ[data.aim] || AIM_ADJ.equilibrada;
  const ramKey = String(data.ram || '4');
  const hzKey = String(data.refreshHz || '60');
  const fpsKey = String(data.fps || '60');

  let globalAdj =
    (RAM_SENSI[ramKey] || 0) +
    (HZ_ADJ[hzKey] || 0) +
    (FPS_ADJ[fpsKey] || 0) +
    (LEVEL_ADJ[data.level] || 0) +
    rand(-2, 3);

  let devAdj = null;
  if (device) devAdj = device.adj;

  // compensação inversa em relação ao DPI atual informado
  let dpiComp = 0;
  if (data.dpiAtual && Number(data.dpiAtual) >= 200 && Number(data.dpiAtual) <= 1200) {
    const diff = 500 - parseInt(data.dpiAtual, 10);
    dpiComp = clamp(Math.round(diff / 25), -12, 12);
  }

  const combined = {};
  for (const k of Object.keys(aimAdj)) {
    combined[k] = aimAdj[k] + (devAdj && devAdj[k] ? devAdj[k] : 0);
  }
  const values = buildValues(st, combined, { globalAdj, dpiComp });
  const dpi = computeDpi(device, ramKey, data.dpiAtual);

  let btnBase = rand(52, 62);
  if (device) btnBase = rand(device.btn[0], device.btn[1]);
  const fireButton = clamp(btnBase + (data.style === 'ag' ? 4 : 0) + (data.aim === 'cabeca' ? 2 : 0), 45, 75);

  return {
    mode: 'gerado',
    knownDevice: !!device,
    deviceName: device ? device.name : null,
    unknownMessage: device
      ? null
      : 'Modelo não encontrado. Usaremos as características informadas para gerar uma configuração personalizada.',
    values,
    dpi,
    fireButton,
    summary: device
      ? 'Análise completa: perfil do dispositivo + suas preferências de jogo.'
      : 'Análise completa com base nas características que você informou.'
  };
}

module.exports = { generateFree, generateVip, generateGerado, MAX_SENSI };

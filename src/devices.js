'use strict';

// Banco de perfis de dispositivos.
// Os valores abaixo são PARÂMETROS INTERNOS DE AJUSTE do gerador
// (faixas de DPI sugerida e ajustes finos de sensibilidade),
// e não especificações técnicas oficiais dos aparelhos.

const DEVICES = [
  { match: ['samsung galaxy a55', 'galaxy a55', 'sm-a556'], name: 'Samsung Galaxy A55', brand: 'Samsung', dpi: [440, 540], adj: { geral: -4, redDot: -3, mira2x: -3, mira4x: -2, miraAwm: -4, olhadinha: -5 }, btn: [58, 64], tier: 2 },
  { match: ['samsung galaxy a54', 'galaxy a54', 'sm-a546'], name: 'Samsung Galaxy A54', brand: 'Samsung', dpi: [430, 520], adj: { geral: -4, redDot: -3, mira2x: -3, mira4x: -2, miraAwm: -4, olhadinha: -5 }, btn: [58, 64], tier: 2 },
  { match: ['samsung galaxy a35', 'galaxy a35', 'sm-a356'], name: 'Samsung Galaxy A35', brand: 'Samsung', dpi: [420, 500], adj: { geral: -2, redDot: -2, mira2x: -2, mira4x: -1, miraAwm: -3, olhadinha: -4 }, btn: [60, 66], tier: 1 },
  { match: ['redmi note 13 pro', 'note 13 pro'], name: 'Redmi Note 13 Pro', brand: 'Xiaomi', dpi: [450, 550], adj: { geral: 3, redDot: 2, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 2 },
  { match: ['redmi note 13', 'note 13'], name: 'Redmi Note 13', brand: 'Xiaomi', dpi: [430, 520], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [58, 64], tier: 1 },
  { match: ['redmi note 12', 'note 12'], name: 'Redmi Note 12', brand: 'Xiaomi', dpi: [420, 500], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 2, miraAwm: 0, olhadinha: 3 }, btn: [60, 66], tier: 1 },
  { match: ['poco x6 pro', 'x6 pro'], name: 'Poco X6 Pro', brand: 'Xiaomi', dpi: [470, 570], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [54, 60], tier: 3 },
  { match: ['poco x6', 'x6'], name: 'Poco X6', brand: 'Xiaomi', dpi: [450, 550], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [56, 62], tier: 2 },
  { match: ['moto g84', 'g84', 'motorola g84'], name: 'Moto G84', brand: 'Motorola', dpi: [400, 480], adj: { geral: 1, redDot: 0, mira2x: 0, mira4x: -1, miraAwm: -2, olhadinha: -1 }, btn: [60, 66], tier: 1 },
  { match: ['moto g54', 'g54', 'motorola g54'], name: 'Moto G54', brand: 'Motorola', dpi: [400, 480], adj: { geral: 1, redDot: 1, mira2x: 0, mira4x: -1, miraAwm: -2, olhadinha: -1 }, btn: [60, 66], tier: 1 },
  { match: ['iphone 15 pro max', 'iphone 15 pro', 'iphone 15'], name: 'iPhone 15', brand: 'Apple', dpi: [470, 570], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 14 pro', 'iphone 14'], name: 'iPhone 14', brand: 'Apple', dpi: [460, 560], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 0, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 13 pro', 'iphone 13'], name: 'iPhone 13', brand: 'Apple', dpi: [460, 560], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 2 },
  { match: ['iphone 12 pro', 'iphone 12'], name: 'iPhone 12', brand: 'Apple', dpi: [450, 540], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 2 },
  { match: ['iphone 11 pro', 'iphone 11'], name: 'iPhone 11', brand: 'Apple', dpi: [440, 530], adj: { geral: 3, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 1 }
];

function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function findDevice(model) {
  const q = normalize(model);
  if (!q) return null;
  const sorted = [...DEVICES].sort((a, b) => Math.max(...b.match.map(m => m.length)) - Math.max(...a.match.map(m => m.length)));
  for (const d of sorted) {
    for (const m of d.match) {
      const nm = normalize(m);
      if (q === nm || q.includes(nm)) return d;
    }
  }
  return null;
}

function deviceNames() {
  return DEVICES.map(d => d.name);
}

module.exports = { DEVICES, findDevice, deviceNames };

'use strict';

const DEVICES = [
  { match: ['samsung galaxy a55', 'galaxy a55', 'sm-a556'], name: 'Samsung Galaxy A55', brand: 'Samsung', dpi: [440, 540], adj: { geral: -4, redDot: -3, mira2x: -3, mira4x: -2, miraAwm: -4, olhadinha: -5 }, btn: [58, 64], tier: 2 },
  { match: ['samsung galaxy a54', 'galaxy a54', 'sm-a546'], name: 'Samsung Galaxy A54', brand: 'Samsung', dpi: [430, 520], adj: { geral: -4, redDot: -3, mira2x: -3, mira4x: -2, miraAwm: -4, olhadinha: -5 }, btn: [58, 64], tier: 2 },
  { match: ['samsung galaxy a35', 'galaxy a35', 'sm-a356'], name: 'Samsung Galaxy A35', brand: 'Samsung', dpi: [420, 500], adj: { geral: -2, redDot: -2, mira2x: -2, mira4x: -1, miraAwm: -3, olhadinha: -4 }, btn: [60, 66], tier: 1 },
  { match: ['samsung a05s', 'a05s'], name: 'Samsung A05s', brand: 'Samsung', dpi: [380, 460], adj: { geral: 2, redDot: 1, mira2x: 1, mira4x: 0, miraAwm: -1, olhadinha: 1 }, btn: [58, 64], tier: 1 },
  { match: ['galaxy s23 fe', 's23 fe'], name: 'Samsung Galaxy S23 FE', brand: 'Samsung', dpi: [450, 540], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 2 },
  { match: ['galaxy s23', 's23'], name: 'Samsung Galaxy S23', brand: 'Samsung', dpi: [460, 550], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['galaxy s22', 's22'], name: 'Samsung Galaxy S22', brand: 'Samsung', dpi: [450, 540], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 2 },
  { match: ['redmi note 13 pro', 'note 13 pro'], name: 'Redmi Note 13 Pro', brand: 'Xiaomi', dpi: [450, 550], adj: { geral: 3, redDot: 2, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 2 },
  { match: ['redmi note 13', 'note 13'], name: 'Redmi Note 13', brand: 'Xiaomi', dpi: [430, 520], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [58, 64], tier: 1 },
  { match: ['redmi note 12 pro', 'note 12 pro'], name: 'Redmi Note 12 Pro', brand: 'Xiaomi', dpi: [440, 530], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 1 },
  { match: ['redmi note 12', 'note 12'], name: 'Redmi Note 12', brand: 'Xiaomi', dpi: [420, 500], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 2, miraAwm: 0, olhadinha: 3 }, btn: [60, 66], tier: 1 },
  { match: ['redmi k70 pro', 'k70 pro'], name: 'Redmi K70 Pro', brand: 'Xiaomi', dpi: [480, 580], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 3, miraAwm: 1, olhadinha: 4 }, btn: [52, 58], tier: 3 },
  { match: ['redmi k60', 'k60'], name: 'Redmi K60', brand: 'Xiaomi', dpi: [460, 560], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [54, 60], tier: 2 },
  { match: ['poco x6 pro', 'x6 pro'], name: 'Poco X6 Pro', brand: 'Xiaomi', dpi: [470, 570], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [54, 60], tier: 3 },
  { match: ['poco x6', 'x6'], name: 'Poco X6', brand: 'Xiaomi', dpi: [450, 550], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [56, 62], tier: 2 },
  { match: ['moto g84', 'g84', 'motorola g84'], name: 'Moto G84', brand: 'Motorola', dpi: [400, 480], adj: { geral: 1, redDot: 0, mira2x: 0, mira4x: -1, miraAwm: -2, olhadinha: -1 }, btn: [60, 66], tier: 1 },
  { match: ['moto g54', 'g54', 'motorola g54'], name: 'Moto G54', brand: 'Motorola', dpi: [400, 480], adj: { geral: 1, redDot: 1, mira2x: 0, mira4x: -1, miraAwm: -2, olhadinha: -1 }, btn: [60, 66], tier: 1 },
  { match: ['moto g34', 'g34', 'motorola g34'], name: 'Moto G34', brand: 'Motorola', dpi: [380, 460], adj: { geral: 0, redDot: -1, mira2x: -1, mira4x: -2, miraAwm: -3, olhadinha: -2 }, btn: [62, 68], tier: 1 },
  { match: ['iphone 17 pro max'], name: 'iPhone 17 Pro Max', brand: 'Apple', dpi: [480, 590], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 3, miraAwm: 1, olhadinha: 4 }, btn: [50, 56], tier: 3 },
  { match: ['iphone 17 pro'], name: 'iPhone 17 Pro', brand: 'Apple', dpi: [480, 590], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 3, miraAwm: 1, olhadinha: 4 }, btn: [50, 56], tier: 3 },
  { match: ['iphone 17'], name: 'iPhone 17', brand: 'Apple', dpi: [470, 580], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone air'], name: 'iPhone Air', brand: 'Apple', dpi: [470, 580], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 3, miraAwm: 1, olhadinha: 4 }, btn: [50, 56], tier: 3 },
  { match: ['iphone 16 pro max'], name: 'iPhone 16 Pro Max', brand: 'Apple', dpi: [475, 585], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 3, miraAwm: 1, olhadinha: 4 }, btn: [50, 56], tier: 3 },
  { match: ['iphone 16 pro'], name: 'iPhone 16 Pro', brand: 'Apple', dpi: [470, 575], adj: { geral: 6, redDot: 5, mira2x: 4, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 16 plus'], name: 'iPhone 16 Plus', brand: 'Apple', dpi: [465, 570], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 16e'], name: 'iPhone 16e', brand: 'Apple', dpi: [450, 550], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 2 },
  { match: ['iphone 16'], name: 'iPhone 16', brand: 'Apple', dpi: [465, 570], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 15 pro max', 'iphone 15 pro', 'iphone 15'], name: 'iPhone 15', brand: 'Apple', dpi: [470, 570], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 1, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 14 pro', 'iphone 14'], name: 'iPhone 14', brand: 'Apple', dpi: [460, 560], adj: { geral: 5, redDot: 4, mira2x: 3, mira4x: 2, miraAwm: 0, olhadinha: 3 }, btn: [52, 58], tier: 3 },
  { match: ['iphone 13 pro', 'iphone 13'], name: 'iPhone 13', brand: 'Apple', dpi: [460, 560], adj: { geral: 4, redDot: 3, mira2x: 3, mira4x: 2, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 2 },
  { match: ['iphone 12 pro', 'iphone 12'], name: 'iPhone 12', brand: 'Apple', dpi: [450, 540], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 2 },
  { match: ['iphone 11 pro', 'iphone 11'], name: 'iPhone 11', brand: 'Apple', dpi: [440, 530], adj: { geral: 3, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 1 },
  { match: ['iphone se 2022', 'iphone se 3'], name: 'iPhone SE (2022)', brand: 'Apple', dpi: [430, 520], adj: { geral: 3, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [58, 64], tier: 1 },
  { match: ['iphone se 2020', 'iphone se 2'], name: 'iPhone SE (2020)', brand: 'Apple', dpi: [430, 520], adj: { geral: 3, redDot: 2, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [58, 64], tier: 1 },
  { match: ['iphone xs max'], name: 'iPhone XS Max', brand: 'Apple', dpi: [445, 535], adj: { geral: 4, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [54, 60], tier: 1 },
  { match: ['iphone xr'], name: 'iPhone XR', brand: 'Apple', dpi: [440, 530], adj: { geral: 3, redDot: 3, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 1 },
  { match: ['iphone x'], name: 'iPhone X', brand: 'Apple', dpi: [435, 525], adj: { geral: 3, redDot: 2, mira2x: 2, mira4x: 1, miraAwm: 0, olhadinha: 2 }, btn: [56, 62], tier: 1 }
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

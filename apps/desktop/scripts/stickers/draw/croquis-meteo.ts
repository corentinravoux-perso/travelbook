/** Croquis: weather and sky. */
import { type Drawing, INK, circle, fill, hatch, ink, sparkle, star, stroke } from './core.ts';
import { accents, drop, poly, sector, solid } from './croquis-kit.ts';

const CLOUD =
  'M84 224Q30 224 30 174Q30 122 90 122Q100 62 172 62Q234 62 252 112Q282 84 322 102Q372 124 362 176Q370 224 320 224Z';

export const METEO: Drawing[] = [
  {
    id: 'meteo-soleil',
    viewBox: '0 0 360 360',
    kw: ['soleil', 'été', 'beau temps', 'chaleur', 'lumière'],
    parts: () => {
      const rays: [number, number][][] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i * 30 * Math.PI) / 180;
        const long = i % 2 === 0;
        const r0 = 104;
        const r1 = long ? 168 : 146;
        const w = long ? 0.13 : 0.1;
        rays.push([
          [180 + Math.cos(a - w) * r0, 180 + Math.sin(a - w) * r0],
          [180 + Math.cos(a) * r1, 180 + Math.sin(a) * r1],
          [180 + Math.cos(a + w) * r0, 180 + Math.sin(a + w) * r0],
        ]);
      }
      return [
        ...rays.flatMap((r, i) =>
          i % 2 === 0 ? solid(poly(r), 5) : ink(poly(r), { w: 6, sketch: false }),
        ),
        ...ink(circle(180, 180, 90), { w: 11 }),
        ...hatch(sector(180, 180, 52, 84, 10, 120), { gap: 8 }),
      ];
    },
  },
  {
    id: 'meteo-nuage',
    viewBox: '0 0 390 250',
    kw: ['nuage', 'ciel', 'temps', 'nuageux'],
    parts: () => [
      ...ink(CLOUD, { w: 11 }),
      ...hatch('M60 200Q120 214 200 206Q290 214 350 190Q352 220 320 222L84 222Q50 222 60 200Z', {
        gap: 8,
        angle: -30,
      }),
      ...stroke('M110 130Q120 96 150 88', 4),
    ],
  },
  {
    id: 'meteo-pluie',
    viewBox: '0 0 390 380',
    kw: ['pluie', 'nuage', 'averse', 'automne', 'parapluie'],
    parts: () => [
      ...ink(CLOUD, { w: 11 }),
      ...hatch('M60 200Q120 214 200 206Q290 214 350 190Q352 220 320 222L84 222Q50 222 60 200Z', {
        gap: 8,
        angle: -30,
      }),
      fill(drop(110, 300, 13), INK),
      fill(drop(200, 330, 13), INK),
      fill(drop(290, 296, 13), INK),
      ...stroke('M150 254L136 290M246 254L232 290M330 248L320 274', 6),
    ],
  },
  {
    id: 'meteo-arc-en-ciel',
    viewBox: '0 0 420 270',
    kw: ['arc-en-ciel', 'pluie', 'soleil', 'couleurs', 'joie'],
    parts: () => [
      ...ink(sector(210, 230, 150, 192, 180, 360), { w: 9 }),
      ...ink(sector(210, 230, 108, 150, 180, 360), { w: 8, sketch: false }),
      ...hatch(sector(210, 230, 108, 150, 180, 360), { gap: 8, angle: 60 }),
      ...ink(sector(210, 230, 70, 108, 180, 360), { w: 8, sketch: false }),
      ...ink('M20 254Q12 216 44 210Q50 180 82 186Q110 176 118 204Q140 214 130 254Z', { w: 9 }),
      ...ink('M290 254Q280 216 312 210Q318 180 350 186Q378 176 386 204Q408 214 398 254Z', { w: 9 }),
    ],
  },
  {
    id: 'meteo-lune-etoiles',
    viewBox: '0 0 340 350',
    kw: ['lune', 'nuit', 'étoile', 'dormir', 'ciel', 'rêve'],
    parts: () => [
      ...ink('M196 28Q76 60 76 176Q76 298 222 318Q118 266 118 176Q118 82 196 28Z', { w: 11 }),
      ...hatch('M98 140Q86 250 160 296Q100 270 92 190Z', { gap: 8 }),
      ...ink(star(250, 120, 40), { w: 7 }),
      fill(star(276, 240, 22), INK),
      fill(sparkle(186, 172, 18), INK),
      fill(sparkle(300, 54, 12), INK),
      fill(circle(228, 206, 5), INK),
    ],
  },
  {
    id: 'meteo-etoile-filante',
    viewBox: '0 0 400 300',
    kw: ['étoile filante', 'voeu', 'nuit', 'ciel', 'rêve', 'magie'],
    parts: () => [
      ...stroke('M30 250Q160 230 250 140', 7),
      ...stroke('M60 196Q160 186 236 120', 5),
      ...stroke('M100 280Q200 250 268 170', 5),
      ...ink(star(296, 104, 82, 5, 0.46, -Math.PI / 2 + 0.3), { w: 10 }),
      ...hatch(star(296, 104, 50, 5, 0.46, -Math.PI / 2 + 0.3), { gap: 8 }),
      ...accents(296, 104, 3, 96, -80, -10, 5),
    ],
  },
  {
    id: 'meteo-flocon',
    viewBox: '0 0 340 340',
    kw: ['flocon', 'neige', 'hiver', 'ski', 'froid', 'montagne'],
    parts: () => {
      const out: string[] = [];
      for (let i = 0; i < 6; i++) {
        const a = (i * 60 * Math.PI) / 180;
        const c = Math.cos(a);
        const s = Math.sin(a);
        const p = (r: number, off: number): string =>
          `${Math.round(170 + c * r - s * off)} ${Math.round(170 + s * r + c * off)}`;
        out.push(...stroke(`M170 170L${p(150, 0)}`, 11));
        out.push(...stroke(`M${p(70, 0)}L${p(104, 34)}M${p(70, 0)}L${p(104, -34)}`, 8));
        out.push(...stroke(`M${p(112, 0)}L${p(138, 24)}M${p(112, 0)}L${p(138, -24)}`, 7));
      }
      out.push(...ink(circle(170, 170, 22), { w: 8, sketch: false }));
      return out;
    },
  },
  {
    id: 'meteo-nuage-soleil',
    viewBox: '0 0 400 320',
    kw: ['soleil', 'nuage', 'éclaircie', 'temps', 'ciel'],
    parts: () => [
      ...[...Array(7).keys()].flatMap((i) => {
        const a = ((-200 + i * 33) * Math.PI) / 180;
        return stroke(
          `M${Math.round(250 + Math.cos(a) * 96)} ${Math.round(110 + Math.sin(a) * 96)}L${Math.round(250 + Math.cos(a) * 130)} ${Math.round(110 + Math.sin(a) * 130)}`,
          9,
        );
      }),
      ...ink(circle(250, 110, 74), { w: 10 }),
      ...hatch(sector(250, 110, 40, 70, -60, 40), { gap: 8 }),
      `<g transform="translate(-10 70)">${[...ink(CLOUD, { w: 11 }), ...hatch('M60 200Q120 214 200 206Q290 214 350 190Q352 220 320 222L84 222Q50 222 60 200Z', { gap: 8, angle: -30 })].join('')}</g>`,
    ],
  },
];

/** Croquis: signs (hearts, stars, sparkles, bubbles, scribbles). */
import {
  type Drawing,
  INK,
  circle,
  fill,
  hatch,
  heart,
  ink,
  smoothClosed,
  smoothOpen,
  sparkle,
  star,
  stroke,
} from './core.ts';
import { type Pt, accents, shine, solid } from './croquis-kit.ts';

/** A loose scribbled loop: `turns` passes around an ellipse with a drifting radius. */
function scribble(cx: number, cy: number, rx: number, ry: number, turns: number): string {
  const pts: Pt[] = [];
  const n = Math.round(turns * 16);
  for (let i = 0; i <= n; i++) {
    const a = (i / 16) * Math.PI * 2 - 2.2;
    const k = 1 + Math.sin(i * 0.55) * 0.06 + (i / n) * 0.1;
    pts.push([Math.round(cx + Math.cos(a) * rx * k), Math.round(cy + Math.sin(a) * ry * k)]);
  }
  return smoothOpen(pts);
}

export const SIGNES: Drawing[] = [
  {
    id: 'signe-coeur-plein',
    viewBox: '0 0 320 300',
    kw: ['coeur', 'amour', 'love', 'plein', 'saint-valentin'],
    parts: () => [
      ...solid(heart(160, 170, 118), 8),
      ...shine('M84 110Q96 82 126 78', 7),
      ...shine('M96 140Q98 128 104 120', 5),
      ...accents(160, 160, 3, 140, 240, 300),
    ],
  },
  {
    id: 'signe-coeur-contour',
    viewBox: '0 0 320 300',
    kw: ['coeur', 'amour', 'love', 'contour'],
    parts: () => [
      ...ink(heart(160, 168, 120), { w: 11 }),
      ...hatch('M220 70Q282 70 276 140Q268 200 168 266Q230 190 240 140Q246 96 220 70Z', { gap: 8 }),
      ...stroke(heart(160, 168, 92), 4, { roughness: 1.6 }),
    ],
  },
  {
    id: 'signe-coeur-gribouille',
    viewBox: '0 0 320 300',
    kw: ['coeur', 'gribouillis', 'amour', 'dessin'],
    parts: () => [
      ...hatch(heart(160, 168, 116), { gap: 11, angle: -30, w: 4 }),
      ...stroke(heart(160, 168, 120), 9, { roughness: 1.4 }),
      ...stroke(heart(162, 166, 116), 4, { roughness: 2 }),
    ],
  },
  {
    id: 'signe-coeurs-trio',
    viewBox: '0 0 360 300',
    kw: ['coeurs', 'amour', 'trois', 'tendresse'],
    parts: () => [
      ...ink(heart(108, 186, 82), { w: 10 }),
      ...hatch('M140 120Q186 120 186 170Q180 210 120 254Q160 200 166 160Q168 136 140 120Z', {
        gap: 8,
      }),
      ...solid(heart(258, 120, 56), 7),
      ...shine('M218 92Q226 76 242 74', 5),
      ...ink(heart(270, 236, 34), { w: 7, sketch: false }),
    ],
  },
  {
    id: 'signe-etoile-pleine',
    viewBox: '0 0 320 310',
    kw: ['étoile', 'star', 'nuit', 'bravo', 'pleine'],
    parts: () => [
      ...solid(star(160, 170, 146, 5, 0.46), 8),
      ...shine('M116 140L148 110', 7),
      ...shine('M160 70L166 90', 5),
    ],
  },
  {
    id: 'signe-etoile-contour',
    viewBox: '0 0 320 310',
    kw: ['étoile', 'star', 'contour', 'bravo'],
    parts: () => [
      ...ink(star(160, 170, 146, 5, 0.46), { w: 11 }),
      ...hatch('M160 24L194 120L300 124L216 186L250 290L196 230Z', { gap: 8 }),
      ...stroke(star(160, 172, 108, 5, 0.46), 4, { roughness: 1.6 }),
    ],
  },
  {
    id: 'signe-etincelles',
    viewBox: '0 0 340 340',
    kw: ['étincelles', 'brillant', 'magie', 'paillettes', 'scintiller'],
    parts: () => [
      ...solid(sparkle(140, 190, 118), 7),
      ...shine('M120 150Q134 130 140 110', 5),
      ...ink(sparkle(270, 90, 58), { w: 8 }),
      ...solid(sparkle(276, 266, 32), 5),
      fill(circle(70, 60, 9), INK),
      fill(circle(300, 186, 7), INK),
    ],
  },
  {
    id: 'signe-exclamation',
    viewBox: '0 0 300 380',
    kw: ['exclamation', 'attention', 'wow', 'surprise', 'important'],
    parts: () => [
      ...ink('M70 40L130 40L118 250L82 250Z', { w: 10 }),
      ...hatch('M112 46L126 46L116 244L102 244Z', { gap: 7 }),
      ...solid(circle(100, 310, 26)),
      ...ink('M180 40L240 40L228 250L192 250Z', { w: 10 }),
      ...hatch('M222 46L236 46L226 244L212 244Z', { gap: 7 }),
      ...solid(circle(210, 310, 26)),
      ...accents(150, 160, 3, 150, 160, 200, 5),
    ],
  },
  {
    id: 'signe-bulle-parole',
    viewBox: '0 0 380 320',
    kw: ['bulle', 'parole', 'dialogue', 'message', 'bd'],
    parts: () => [
      ...ink(
        'M70 40L310 40Q350 40 350 80L350 196Q350 236 310 236L150 236L80 296L100 236L70 236Q30 236 30 196L30 80Q30 40 70 40Z',
        { w: 11 },
      ),
      ...hatch('M320 50Q344 60 344 90L344 196Q344 226 312 230L300 230Q330 200 320 50Z', { gap: 8 }),
      ...solid(circle(120, 138, 16)),
      ...solid(circle(190, 138, 16)),
      ...solid(circle(260, 138, 16)),
    ],
  },
  {
    id: 'signe-bulle-pensee',
    viewBox: '0 0 400 330',
    kw: ['bulle', 'pensée', 'rêve', 'idée', 'nuage'],
    parts: () => [
      ...ink(
        smoothClosed([
          [80, 120],
          [110, 60],
          [180, 50],
          [240, 40],
          [300, 70],
          [350, 110],
          [360, 170],
          [320, 220],
          [250, 236],
          [180, 234],
          [110, 222],
          [60, 180],
        ]),
        { w: 11 },
      ),
      ...hatch('M330 120Q362 170 318 216Q260 238 190 232Q300 210 330 120Z', { gap: 8 }),
      ...ink(circle(92, 262, 20), { w: 8, sketch: false }),
      ...ink(circle(52, 304, 12), { w: 7, sketch: false }),
    ],
  },
  {
    id: 'signe-cercle-gribouille',
    viewBox: '0 0 420 300',
    kw: ['cercle', 'entourer', 'gribouillis', 'surligner'],
    parts: () => [...stroke(scribble(206, 152, 170, 104, 2.3), 8, { roughness: 1.1, bowing: 1.2 })],
  },
  {
    id: 'signe-souligne-vague',
    viewBox: '0 0 420 120',
    kw: ['souligner', 'vague', 'trait', 'soulignement'],
    parts: () => {
      const pts: Pt[] = [];
      for (let x = 20; x <= 400; x += 20) pts.push([x, Math.round(50 + Math.sin(x / 32) * 22)]);
      return [...stroke(smoothOpen(pts), 11), ...stroke('M40 96Q200 82 380 92', 6)];
    },
  },
  {
    id: 'signe-souligne-double',
    viewBox: '0 0 420 120',
    kw: ['souligner', 'double', 'trait', 'soulignement'],
    parts: () => [
      ...stroke('M20 44Q210 26 400 40', 11),
      ...stroke('M40 84Q220 70 380 86', 9),
      ...stroke('M380 86L404 96', 6),
    ],
  },
  {
    id: 'signe-encadre',
    viewBox: '0 0 420 300',
    kw: ['cadre', 'encadré', 'rectangle', 'bordure', 'note'],
    parts: () => [
      ...stroke('M24 40L398 30L392 270L32 278Z', 10, { roughness: 1.2 }),
      ...stroke('M40 24L404 44M396 20L384 286M410 262L18 270M26 290L44 18', 4, { roughness: 1.8 }),
    ],
  },
];

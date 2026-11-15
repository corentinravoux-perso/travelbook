/** Bohème: flat colour flowers, sprigs and leaves, tropical plants. */
import { type Drawing, INK, blob, circle, fill, heart, rotate, smoothOpen, sparkle, stroke } from './core.ts';
import { P, leaf, line, petal, ring, roundPetal } from './boheme-kit.ts';

export const FLEURS: Drawing[] = [
  {
    id: 'fleur-turquoise-prune',
    viewBox: '0 0 400 400',
    kw: ['fleur', 'turquoise', 'bleu', 'violet'],
    parts: () => [
      ...ring(200, 200, 7, petal(180, 0.42), P.teal, 8),
      ...ring(200, 200, 7, petal(130, 0.34), P.tealDark, 8),
      ...ring(200, 200, 7, petal(92, 0.3), '#6b5ca5', 30),
      fill(circle(200, 200, 32), P.plum),
      fill(circle(200, 200, 18), '#7a3462'),
    ],
  },
  {
    id: 'fleur-corail-etoile',
    viewBox: '0 0 400 400',
    kw: ['fleur', 'corail', 'orange', 'lys'],
    parts: () => {
      const dots: string[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        dots.push(fill(circle(200 + Math.cos(a) * 58, 200 + Math.sin(a) * 58, 4.5), INK));
      }
      return [
        ...ring(200, 200, 6, petal(185, 0.36), P.coral, 0),
        ...ring(200, 200, 6, petal(120, 0.18), P.coralLight, 0),
        ...dots,
        fill(circle(200, 200, 36), '#3b1d2a'),
      ];
    },
  },
  {
    id: 'brin-coeurs',
    viewBox: '0 0 260 420',
    kw: ['brin', 'coeur', 'amour', 'tige', 'fleur'],
    parts: () => [
      ...stroke(smoothOpen([[130, 410], [128, 300], [134, 180], [130, 70]]), 4, { stroke: P.sage, roughness: 0.3 }),
      ...stroke('M130 300Q90 260 70 200M132 250Q176 210 196 150M131 180Q100 140 92 100', 3.4, { stroke: P.sage, roughness: 0.3 }),
      fill(heart(130, 62, 20), P.red),
      fill(heart(70, 192, 17), P.red),
      fill(heart(198, 142, 17), P.red),
      fill(heart(92, 92, 14), P.red),
      leaf(128, 340, 52, -150, P.sage),
      leaf(130, 360, 50, -30, P.sage),
    ],
  },
  {
    id: 'brin-feuilles-ovales',
    viewBox: '0 0 220 420',
    kw: ['brin', 'feuille', 'eucalyptus', 'branche', 'vert'],
    parts: () => {
      const out: string[] = [
        ...stroke(smoothOpen([[110, 410], [106, 300], [114, 190], [108, 40]]), 4, { stroke: P.sage, roughness: 0.3 }),
      ];
      const ys = [360, 310, 262, 214, 168, 124, 84];
      ys.forEach((y, i) => {
        out.push(`<ellipse cx="${i % 2 ? 150 : 70}" cy="${y}" rx="${30 - i * 2}" ry="${18 - i}" transform="rotate(${i % 2 ? -30 : 30} ${i % 2 ? 150 : 70} ${y})" fill="${P.sage}"/>`);
        out.push(...stroke(`M110 ${y + 14}L${i % 2 ? 130 : 90} ${y + 4}`, 3, { stroke: P.sage, roughness: 0.3 }));
      });
      out.push(fill(circle(108, 36, 12), P.red), fill(circle(160, 236, 7), P.red), fill(circle(60, 150, 7), P.red));
      return out;
    },
  },
  {
    id: 'tropique-hibiscus-monstera',
    viewBox: '0 0 440 400',
    kw: ['hibiscus', 'monstera', 'tropical', 'île', 'été', 'fleur', 'feuille'],
    parts: () => {
      const monstera = (x: number, y: number, deg: number, s: number, c: string): string =>
        rotate(
          [
            `<path d="M0 0C-60 -40 -70 -140 0 -190C70 -140 60 -40 0 0Z" transform="scale(${s})" fill="${c}"/>`,
            ...[-150, -110, -70, -35].flatMap((yy) => [
              `<path d="M0 ${yy}L-46 ${yy + 30}L-44 ${yy + 14}Z" transform="scale(${s})" fill="#ffffff"/>`,
              `<path d="M0 ${yy}L46 ${yy + 30}L44 ${yy + 14}Z" transform="scale(${s})" fill="#ffffff"/>`,
            ]),
            `<path d="M0 0L0 -180" transform="scale(${s})" stroke="${P.leafDark}" stroke-width="4" fill="none"/>`,
          ],
          deg,
          0,
          0,
        ).replace('<g ', `<g transform="translate(${x} ${y})"><g `) + '</g>';
      return [
        monstera(150, 300, -55, 1.05, P.leaf),
        monstera(290, 300, 50, 0.95, P.leafLight),
        monstera(220, 330, -5, 0.9, P.leafDark),
        ...ring(220, 210, 5, roundPetal(120, 0.62), P.pink, 10),
        ...ring(220, 210, 5, roundPetal(80, 0.5), '#d94a63', 10),
        fill(circle(220, 210, 14), '#b8324d'),
        ...stroke('M220 210Q250 160 262 118', 4, { stroke: '#f6d46b', roughness: 0.2 }),
        fill(circle(262, 116, 7), '#f6d46b'),
        fill(circle(250, 124, 5), '#f6d46b'),
      ];
    },
  },
];

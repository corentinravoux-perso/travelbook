/** Bohème, "Ligne et couleur": thin black line art over a soft colour blob, dots, sparkles. */
import { type Drawing, INK, blob, circle, fill, heart, rotate, smoothOpen, sparkle, stroke } from './core.ts';
import { P, leaf, line, petal, ring, roundPetal } from './boheme-kit.ts';

export const LIGNE: Drawing[] = [
  {
    id: 'ligne-bouteille-coupe',
    viewBox: '0 0 400 420',
    kw: ['bouteille', 'vin', 'champagne', 'coupe', 'verre', 'apéro', 'fête'],
    parts: () => [
      fill(blob(200, 220, 120, 130, 7), P.peach),
      // Bottle
      ...line('M86 400L86 214Q86 176 112 160L116 92L140 92L144 160Q170 176 170 214L170 400Z'),
      ...line('M112 108L144 108'),
      ...line('M98 260L158 260L158 330L98 330Z', 2.4),
      // Coupe
      ...line('M190 228Q186 290 246 296Q306 290 302 228Z'),
      ...line('M246 296L246 384M206 392Q246 378 286 392'),
      ...line('M196 252Q246 262 298 252', 2.2),
      // Branch
      ...line(smoothOpen([[300, 400], [318, 360], [330, 322], [350, 290]]), 2.4),
      ...[[318, 360, -40], [330, 330, -20], [345, 300, -50]].flatMap(([x, y, a]) => line(`M${x} ${y}q${a! < -30 ? 26 : 22} -14 32 -32q-26 6 -32 32Z`, 2)),
      fill(sparkle(276, 120, 18), INK),
      fill(sparkle(310, 160, 9), INK),
      fill(sparkle(230, 96, 7), INK),
      fill(circle(250, 140, 3.5), INK),
      fill(circle(296, 96, 3), INK),
    ],
  },
  {
    id: 'ligne-soleil-lune',
    viewBox: '0 0 400 400',
    kw: ['soleil', 'lune', 'nuit', 'ciel', 'étoile', 'bohème'],
    parts: () => {
      const rays: string[] = [];
      for (let i = 0; i < 9; i++) {
        const a = (-90 + i * 40 - 12) * (Math.PI / 180);
        const x = 170 + Math.cos(a) * 140;
        const y = 180 + Math.sin(a) * 140;
        rays.push(...line(`M170 180Q${(170 + x) / 2 + 14} ${(180 + y) / 2 - 10} ${x.toFixed(0)} ${y.toFixed(0)}`));
      }
      return [
        fill(blob(250, 160, 120, 110, 3), P.mustard),
        ...rays,
        fill('M118 250C88 286 104 346 156 360C120 372 74 346 72 300C70 272 90 252 118 250Z', INK),
        fill(sparkle(320, 300, 16), INK),
        fill(sparkle(80, 120, 11), INK),
        fill(sparkle(340, 70, 9), INK),
        fill(sparkle(220, 350, 8), INK),
        fill(circle(290, 340, 3.5), INK),
        fill(circle(120, 60, 3), INK),
      ];
    },
  },
];

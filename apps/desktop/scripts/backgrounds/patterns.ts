/**
 * Our own pattern tiles (CLEANROOM.md): 100 × 100 SVG stencils, drawn in black on transparency.
 * The renderer paints the black with the pattern's `fg` colour over its `bg` colour, so a tile
 * carries no colour of its own and nothing is ever written into the SVG text at run time. Every
 * tile repeats seamlessly: shapes that leave the tile are clipped by it and come back on the
 * opposite side (lattices run one cell past each edge, offset rows use an even row count).
 */

export interface PatternTile {
  /** File name without extension: lower-case words joined by `-`. */
  id: string;
  /** French name. */
  title: string;
  svg: string;
}

const SIZE = 100;
const f = (n: number): string => String(Math.round(n * 100) / 100);

const wrap = (body: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><g fill="#000">${body}</g></svg>\n`;

/** A shape drawn centred on `(x, y)` in a cell of side `cell`. */
type Shape = (x: number, y: number, cell: number) => string;

const circle =
  (k: number): Shape =>
  (x, y, c) =>
    `<circle cx="${f(x)}" cy="${f(y)}" r="${f((c * k) / 2)}"/>`;
const square =
  (k: number): Shape =>
  (x, y, c) =>
    `<rect x="${f(x - (c * k) / 2)}" y="${f(y - (c * k) / 2)}" width="${f(c * k)}" height="${f(c * k)}"/>`;
const diamond =
  (k: number): Shape =>
  (x, y, c) => {
    const r = (c * k) / 2;
    return `<path d="M${f(x)} ${f(y - r)}L${f(x + r)} ${f(y)}L${f(x)} ${f(y + r)}L${f(x - r)} ${f(y)}Z"/>`;
  };
const triangle =
  (k: number): Shape =>
  (x, y, c) => {
    const r = (c * k) / 2;
    return `<path d="M${f(x)} ${f(y - r)}L${f(x + r)} ${f(y + r)}L${f(x - r)} ${f(y + r)}Z"/>`;
  };
const plus =
  (k: number, thick: number): Shape =>
  (x, y, c) => {
    const r = (c * k) / 2;
    const t = (c * thick) / 2;
    return `<path d="M${f(x - t)} ${f(y - r)}h${f(2 * t)}v${f(r - t)}h${f(r - t)}v${f(2 * t)}h${f(t - r)}v${f(r - t)}h${f(-2 * t)}v${f(t - r)}h${f(t - r)}v${f(-2 * t)}h${f(r - t)}Z"/>`;
  };
const cross =
  (k: number, thick: number): Shape =>
  (x, y, c) =>
    `<g transform="rotate(45 ${f(x)} ${f(y)})">${plus(k, thick)(x, y, c)}</g>`;
const star =
  (k: number, points: number): Shape =>
  (x, y, c) => {
    const outer = (c * k) / 2;
    const inner = outer * 0.45;
    const path = Array.from({ length: points * 2 }, (_, i) => {
      const a = (Math.PI * i) / points - Math.PI / 2;
      const r = i % 2 === 0 ? outer : inner;
      return `${i === 0 ? 'M' : 'L'}${f(x + r * Math.cos(a))} ${f(y + r * Math.sin(a))}`;
    }).join('');
    return `<path d="${path}Z"/>`;
  };
const hexagon =
  (k: number): Shape =>
  (x, y, c) => {
    const r = (c * k) / 2;
    const path = Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI * i) / 3;
      return `${i === 0 ? 'M' : 'L'}${f(x + r * Math.cos(a))} ${f(y + r * Math.sin(a))}`;
    }).join('');
    return `<path d="${path}Z"/>`;
  };
const heart =
  (k: number): Shape =>
  (x, y, c) => {
    const s = (c * k) / 2;
    return `<path d="M${f(x)} ${f(y + s * 0.9)}C${f(x - s * 1.5)} ${f(y - s * 0.1)} ${f(x - s * 0.7)} ${f(y - s * 1.1)} ${f(x)} ${f(y - s * 0.35)}C${f(x + s * 0.7)} ${f(y - s * 1.1)} ${f(x + s * 1.5)} ${f(y - s * 0.1)} ${f(x)} ${f(y + s * 0.9)}Z"/>`;
  };
const leaf =
  (k: number): Shape =>
  (x, y, c) => {
    const s = (c * k) / 2;
    return `<path d="M${f(x - s)} ${f(y + s)}C${f(x - s)} ${f(y - s * 0.4)} ${f(x + s * 0.2)} ${f(y - s)} ${f(x + s)} ${f(y - s)}C${f(x + s)} ${f(y + s * 0.4)} ${f(x - s * 0.2)} ${f(y + s)} ${f(x - s)} ${f(y + s)}Z"/>`;
  };
const ring =
  (k: number, thick: number): Shape =>
  (x, y, c) => {
    const r = (c * k) / 2;
    return `<path fill-rule="evenodd" d="M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0ZM${f(x - r + thick)} ${f(y)}a${f(r - thick)} ${f(r - thick)} 0 1 0 ${f(2 * (r - thick))} 0a${f(r - thick)} ${f(r - thick)} 0 1 0 ${f(-2 * (r - thick))} 0Z"/>`;
  };
const flower =
  (k: number): Shape =>
  (x, y, c) => {
    const r = (c * k) / 2;
    const petals = Array.from({ length: 4 }, (_, i) => {
      const a = (Math.PI * i) / 2;
      return `<circle cx="${f(x + r * 0.5 * Math.cos(a))}" cy="${f(y + r * 0.5 * Math.sin(a))}" r="${f(r * 0.5)}"/>`;
    });
    return petals.join('');
  };
const dash =
  (k: number): Shape =>
  (x, y, c) =>
    `<rect x="${f(x - (c * k) / 2)}" y="${f(y - c * 0.06)}" width="${f(c * k)}" height="${f(c * 0.12)}" rx="${f(c * 0.06)}"/>`;

/** `n × n` cells of the shape; with `offset`, every other row moves half a cell (n even). */
function lattice(n: number, shape: Shape, offset = false): string {
  const cell = SIZE / n;
  const out: string[] = [];
  for (let row = -1; row <= n; row++) {
    const shift = offset && ((row % 2) + 2) % 2 === 1 ? cell / 2 : 0;
    for (let col = -1; col <= n; col++) {
      out.push(shape(col * cell + cell / 2 + shift, row * cell + cell / 2, cell));
    }
  }
  return out.join('');
}

/** Parallel bands, `n` per tile, each `fill` of its period wide. */
function bands(n: number, fill: number, direction: 'h' | 'v' | 'd1' | 'd2'): string {
  const p = SIZE / n;
  const w = p * fill;
  const out: string[] = [];
  for (let i = -n; i <= 2 * n; i++) {
    const a = i * p;
    switch (direction) {
      case 'h':
        out.push(`<rect x="0" y="${f(a)}" width="${SIZE}" height="${f(w)}"/>`);
        break;
      case 'v':
        out.push(`<rect x="${f(a)}" y="0" width="${f(w)}" height="${SIZE}"/>`);
        break;
      case 'd1':
        out.push(`<path d="M${f(a)} 0H${f(a + w)}L${f(a + w - SIZE)} ${SIZE}H${f(a - SIZE)}Z"/>`);
        break;
      case 'd2':
        out.push(`<path d="M${f(a)} 0H${f(a + w)}L${f(a + w + SIZE)} ${SIZE}H${f(a + SIZE)}Z"/>`);
        break;
    }
  }
  return out.join('');
}

/** Checkerboard of `n × n` squares. */
function checks(n: number): string {
  const c = SIZE / n;
  const out: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let q = 0; q < n; q++) {
      if ((r + q) % 2 === 0)
        out.push(`<rect x="${f(q * c)}" y="${f(r * c)}" width="${f(c)}" height="${f(c)}"/>`);
    }
  }
  return out.join('');
}

/** Gingham: two crossing bands of half opacity, which overlap darker. */
function gingham(n: number): string {
  const c = SIZE / n;
  const out: string[] = [];
  for (let i = 0; i < n; i += 2) {
    out.push(
      `<rect x="${f(i * c)}" y="0" width="${f(c)}" height="${SIZE}" fill-opacity="0.45"/>`,
      `<rect x="0" y="${f(i * c)}" width="${SIZE}" height="${f(c)}" fill-opacity="0.45"/>`,
    );
  }
  return out.join('');
}

/** Lines of a grid, `n` per tile, `thick` wide. */
function grid(n: number, thick: number): string {
  const c = SIZE / n;
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    out.push(
      `<rect x="${f(i * c - thick / 2)}" y="0" width="${f(thick)}" height="${SIZE}"/>`,
      `<rect x="${f(i * c + SIZE - thick / 2)}" y="0" width="${f(thick)}" height="${SIZE}"/>`,
      `<rect x="0" y="${f(i * c - thick / 2)}" width="${SIZE}" height="${f(thick)}"/>`,
      `<rect x="0" y="${f(i * c + SIZE - thick / 2)}" width="${SIZE}" height="${f(thick)}"/>`,
    );
  }
  return out.join('');
}

/** A stroked path repeated in rows; the path runs across the tile and one period beyond. */
function stroked(
  rows: number,
  thick: number,
  path: (y: number, period: number) => string,
  periods: number,
): string {
  const rowH = SIZE / rows;
  const out: string[] = [];
  for (let r = -1; r <= rows; r++) {
    out.push(
      `<path fill="none" stroke="#000" stroke-width="${f(thick)}" stroke-linejoin="round" d="${path(r * rowH + rowH / 2, SIZE / periods)}"/>`,
    );
  }
  return out.join('');
}

const wave =
  (amp: number) =>
  (y: number, p: number): string => {
    let d = `M${f(-p)} ${f(y)}`;
    for (let x = -p; x < SIZE + p; x += p) {
      d += `q${f(p / 4)} ${f(-amp)} ${f(p / 2)} 0t${f(p / 2)} 0`;
    }
    return d;
  };
const zigzag =
  (amp: number) =>
  (y: number, p: number): string => {
    let d = `M${f(-p)} ${f(y)}`;
    for (let x = -p; x < SIZE + p; x += p) d += `l${f(p / 2)} ${f(-amp)}l${f(p / 2)} ${f(amp)}`;
    return d;
  };
const chevron =
  (amp: number) =>
  (y: number, p: number): string => {
    let d = `M${f(-p)} ${f(y + amp)}`;
    for (let x = -p; x < SIZE + p; x += p) d += `l${f(p / 2)} ${f(-amp)}l${f(p / 2)} ${f(amp)}`;
    return d;
  };

/** Scallops: rows of half circles, each row shifted half a period. */
function scallops(n: number, thick: number): string {
  const c = SIZE / n;
  const out: string[] = [];
  for (let r = -1; r <= 2 * n + 1; r++) {
    const shift = ((r % 2) + 2) % 2 === 1 ? c / 2 : 0;
    for (let q = -1; q <= n; q++) {
      const x = q * c + shift;
      const y = r * (c / 2) + c / 2;
      out.push(
        `<path fill="none" stroke="#000" stroke-width="${f(thick)}" d="M${f(x)} ${f(y)}a${f(c / 2)} ${f(c / 2)} 0 0 1 ${f(c)} 0"/>`,
      );
    }
  }
  return out.join('');
}

/** Bricks: `rows` rows (even) of bricks laid with half-brick joints. */
function bricks(rows: number, perRow: number, joint: number): string {
  const h = SIZE / rows;
  const w = SIZE / perRow;
  const out: string[] = [];
  for (let r = 0; r < rows; r++) {
    const shift = r % 2 === 1 ? w / 2 : 0;
    for (let q = -1; q <= perRow; q++) {
      out.push(
        `<rect x="${f(q * w + shift + joint / 2)}" y="${f(r * h + joint / 2)}" width="${f(w - joint)}" height="${f(h - joint)}"/>`,
      );
    }
  }
  return out.join('');
}

/** Argyle: faint diamonds with a dot at each centre. */
function argyle(n: number): string {
  return `<g fill-opacity="0.4">${lattice(n, diamond(0.92))}</g>${lattice(n, circle(0.22))}`;
}

/** A lattice of triangles pointing up (solid) and down (half opacity). */
function triangles(n: number): string {
  const c = SIZE / n;
  const out: string[] = [];
  for (let r = -1; r <= n; r++) {
    for (let q = -1; q <= n; q++) {
      const x = q * c;
      const y = r * c;
      const up = (r + q) % 2 === 0;
      out.push(
        up
          ? `<path d="M${f(x)} ${f(y + c)}L${f(x + c / 2)} ${f(y)}L${f(x + c)} ${f(y + c)}Z"/>`
          : `<path d="M${f(x)} ${f(y)}L${f(x + c)} ${f(y)}L${f(x + c / 2)} ${f(y + c)}Z" fill-opacity="0.5"/>`,
      );
    }
  }
  return out.join('');
}

/** Concentric rings in a lattice. */
function targets(n: number): string {
  return lattice(n, ring(0.9, 100 / n / 10)) + lattice(n, circle(0.35));
}

/** Seeded scatter of small shapes; wraps at the edges through nine copies. */
function scatter(
  count: number,
  shape: (size: number, turn: number) => Shape,
  size: number,
  seed: number,
): string {
  let s = seed;
  const rnd = (): number => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const x = rnd() * SIZE;
    const y = rnd() * SIZE;
    const k = size * (0.7 + rnd() * 0.6);
    const turn = rnd() * 360;
    const draw = shape(k, turn)(0, 0, 1);
    for (const dx of [-SIZE, 0, SIZE]) {
      for (const dy of [-SIZE, 0, SIZE]) {
        const px = x + dx;
        const py = y + dy;
        if (px < -k || px > SIZE + k || py < -k || py > SIZE + k) continue;
        out.push(`<g transform="translate(${f(px)} ${f(py)}) rotate(${f(turn)})">${draw}</g>`);
      }
    }
  }
  return out.join('');
}

const tile = (id: string, title: string, body: string): PatternTile => ({
  id,
  title,
  svg: wrap(body),
});

export function patternTiles(): PatternTile[] {
  const t: PatternTile[] = [];
  const add = (id: string, title: string, body: string): void => {
    t.push(tile(id, title, body));
  };

  // Dots, squares, diamonds and other shapes on a straight lattice or an offset one.
  add('dots-fine', 'Petits pois', lattice(10, circle(0.36)));
  add('dots-medium', 'Pois', lattice(5, circle(0.4)));
  add('dots-large', 'Gros pois', lattice(3, circle(0.5)));
  add('dots-offset-fine', 'Pois décalés fins', lattice(10, circle(0.4), true));
  add('dots-offset', 'Pois décalés', lattice(6, circle(0.5), true));
  add('dots-offset-large', 'Pois décalés larges', lattice(4, circle(0.6), true));
  add('squares-fine', 'Petits carrés', lattice(10, square(0.4)));
  add('squares', 'Carrés', lattice(5, square(0.5)));
  add('squares-offset', 'Carrés décalés', lattice(6, square(0.5), true));
  add('diamonds-fine', 'Petits losanges', lattice(10, diamond(0.7)));
  add('diamonds', 'Losanges', lattice(5, diamond(0.8)));
  add('diamonds-offset', 'Losanges décalés', lattice(6, diamond(0.8), true));
  add('triangles-lattice', 'Triangles alternés', triangles(8));
  add('triangles-small', 'Petits triangles', triangles(12));
  add('triangles-scattered', 'Triangles posés', lattice(5, triangle(0.55)));
  add('plus-fine', 'Petits plus', lattice(10, plus(0.6, 0.18)));
  add('plus', 'Plus', lattice(5, plus(0.6, 0.2)));
  add('crosses', 'Croix', lattice(6, cross(0.55, 0.18), true));
  add('stars-fine', 'Petites étoiles', lattice(8, star(0.6, 5)));
  add('stars', 'Étoiles', lattice(4, star(0.65, 5), true));
  add('stars-four', 'Étoiles à quatre branches', lattice(6, star(0.7, 4), true));
  add('hexagons', 'Hexagones', lattice(6, hexagon(0.7), true));
  add('hexagons-large', 'Grands hexagones', lattice(4, hexagon(0.8), true));
  add('hearts', 'Cœurs', lattice(5, heart(0.6), true));
  add('hearts-fine', 'Petits cœurs', lattice(8, heart(0.55)));
  add('leaves', 'Feuilles', lattice(5, leaf(0.6), true));
  add('leaves-fine', 'Petites feuilles', lattice(8, leaf(0.55), true));
  add('flowers', 'Fleurs', lattice(4, flower(0.8), true));
  add('flowers-fine', 'Petites fleurs', lattice(6, flower(0.7)));
  add('rings', 'Anneaux', lattice(5, ring(0.8, 3)));
  add('rings-offset', 'Anneaux décalés', lattice(6, ring(0.85, 2.5), true));
  add('targets', 'Cibles', targets(4));
  add('dashes', 'Tirets', lattice(8, dash(0.7), true));

  // Bands.
  add('stripes-hair', 'Rayures fines', bands(20, 0.25, 'h'));
  add('stripes', 'Rayures', bands(10, 0.5, 'h'));
  add('stripes-wide', 'Rayures larges', bands(4, 0.5, 'h'));
  add('pinstripes', 'Rayures tennis', bands(10, 0.12, 'v'));
  add('stripes-vertical', 'Rayures verticales', bands(10, 0.5, 'v'));
  add('stripes-vertical-wide', 'Rayures verticales larges', bands(5, 0.5, 'v'));
  add('diagonal-hair', 'Diagonales fines', bands(20, 0.2, 'd1'));
  add('diagonal', 'Diagonales', bands(10, 0.5, 'd1'));
  add('diagonal-wide', 'Diagonales larges', bands(5, 0.5, 'd1'));
  add('diagonal-reverse', 'Diagonales inversées', bands(10, 0.5, 'd2'));
  add('diagonal-reverse-wide', 'Diagonales inversées larges', bands(4, 0.5, 'd2'));
  add('diagonal-hatch', 'Hachures croisées', bands(10, 0.12, 'd1') + bands(10, 0.12, 'd2'));

  // Checks and grids.
  add('checks', 'Damier', checks(4));
  add('checks-fine', 'Petit damier', checks(10));
  add('checks-large', 'Grand damier', checks(2));
  add('gingham', 'Vichy', gingham(8));
  add('gingham-fine', 'Petit vichy', gingham(16));
  add('grid', 'Quadrillage', grid(5, 1.2));
  add('grid-fine', 'Quadrillage fin', grid(10, 0.8));
  add('grid-large', 'Grand quadrillage', grid(2, 1.6));
  add('bricks', 'Briques', bricks(8, 4, 3));
  add('bricks-fine', 'Petites briques', bricks(12, 6, 2));

  // Lines.
  add('waves', 'Vagues', stroked(6, 2.4, wave(5), 5));
  add('waves-fine', 'Petites vagues', stroked(10, 1.6, wave(3), 10));
  add('waves-large', 'Grandes vagues', stroked(3, 3.2, wave(8), 2));
  add('zigzag', 'Zigzag', stroked(6, 2.4, zigzag(5), 5));
  add('zigzag-fine', 'Petit zigzag', stroked(10, 1.6, zigzag(3), 10));
  add('chevrons', 'Chevrons', stroked(6, 2.8, chevron(6), 5));
  add('chevrons-large', 'Grands chevrons', stroked(4, 3.4, chevron(10), 4));
  add('scallops', 'Écailles', scallops(5, 2.2));
  add('scallops-fine', 'Petites écailles', scallops(10, 1.6));
  add('argyle', 'Losanges écossais', argyle(4));

  // Scattered shapes, which tile because their copies wrap around.
  add(
    'confetti',
    'Confettis',
    scatter(40, (k) => (x, y) => circle(1)(x, y, k), 3.2, 11),
  );
  add(
    'speckle',
    'Mouchetures',
    scatter(90, (k) => (x, y) => circle(1)(x, y, k), 1.6, 23),
  );
  add(
    'sparkles',
    'Étincelles',
    scatter(26, (k) => (x, y) => star(1, 4)(x, y, k), 7, 5),
  );
  add(
    'stars-scattered',
    'Étoiles semées',
    scatter(24, (k) => (x, y) => star(1, 5)(x, y, k), 7, 37),
  );
  add(
    'petals',
    'Pétales',
    scatter(30, (k) => (x, y) => leaf(1)(x, y, k), 7, 41),
  );
  add(
    'hearts-scattered',
    'Cœurs semés',
    scatter(22, (k) => (x, y) => heart(1)(x, y, k), 7, 53),
  );
  return t;
}

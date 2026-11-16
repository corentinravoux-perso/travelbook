/**
 * Contact sheet of the base subjects, a QA tool for the geodata (design section 7):
 *
 *   node scripts/maps/render-sheet.ts <ids|all> <outDir>
 *
 * `ids` is a comma-separated list of subject ids of `resources/maps/index.json` (`TH,FR-MET,US-HI`),
 * or `all`. It writes `sheet-01.png`, `sheet-02.png`... into `outDir` (any older `sheet-NN.png` there
 * is removed first). Never commit the PNGs.
 *
 * Each subject gets a cell: a 100 px overview of the whole land (labelled with its id and a few
 * numbers) next to a 400 px zoom (labelled `<id> zoom`) on its most indented coast.
 *
 * Drawn with the `ardoise` preset of the approved pilot: land and regions filled #5b5f66, white
 * outlines. Two QA additions that the preset does not have:
 * - the land is painted magenta UNDER the regions, so any land the regions do not cover (a gap, a
 *   sliver, a missing island) shows magenta, and regions that spill past the land outline show as
 *   slate outside the white outline;
 * - the regions alternate between three shades of the slate, so the split (France vs its overseas
 *   parts, the US vs Alaska and Hawaii) reads at 100 px where a hairline would not.
 * A yellow frame on the overview marks where the zoom was taken. Strokes are fixed in pixels, not
 * in mm on the page: the sheet shows the data, not the printed weight.
 *
 * Projection: equirectangular, longitudes scaled by the cosine of the middle latitude of the land
 * and cut at the widest empty band of longitudes, so Alaska, the Aleutians or Chukotka stay in one
 * piece across the antimeridian. Not the projection of the app (Task 8 chooses that), only a
 * readable one.
 *
 * Zoom heuristic ("most indented coast", deterministic, nothing hand-picked): the land's rings are
 * cut into pieces no longer than a quarter window, and each piece's length is added to a grid of
 * cells half a window wide. The window is the 2 x 2 block of cells holding the most coastline per
 * unit of window width: a straight coast crosses a window in about one width, a fjord, a delta or
 * an archipelago in many. The window is then centred on the length-weighted centre of the coast
 * inside it. Its side is 20 % of the larger side of the main landmass (polygons holding at least
 * 1 % of the area, like `mainBbox`). Ties go to the lowest row, then the lowest column.
 *
 * Land borders are not coast: a piece of the land outline that lies within 6 simplification
 * tolerances of the `neighbours` layer is left out of the count, so a winding river border (Peru
 * and Colombia, French Guiana and Suriname) does not pass for an indented coast. A border that no
 * neighbour polygon covers (the layer is clipped to 1.3 x the main bbox) still counts.
 */
import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import type { MapIndex } from './build-geodata.ts';
import { appFileUrl } from './paths.ts';
import { toleranceMetres } from './simplify.ts';

type Pt = [number, number];
type Ring = Pt[];
type Box = [number, number, number, number];

// ---------------------------------------------------------------------------------------------
// Style: `ardoise` tokens copied from the approved pilot (pilot/presets.json), plus the QA colours.
const ARDOISE = { fill: '#5b5f66', stroke: '#ffffff', marker: '#f4c542' };
const REGION_SHADES = [ARDOISE.fill, '#6c717b', '#4b4f56'];
const GAP = '#e0457b';
const PAPER = '#eceae4';
const FRAME = '#b9b5aa';
const INK = '#111111';

const OVERVIEW_PX = 100;
const ZOOM_PX = 400;
const OVERVIEW_PAD = 5;
const ZOOM_FRACTION = 0.2;
/** A land-outline segment this close (in simplification tolerances) to a neighbour is a border. */
const BORDER_REACH = 6;
const STROKES = {
  overview: { land: 0.6, regions: 0.35 },
  zoom: { land: 1.2, regions: 0.8 },
};

const COLUMNS = 3;
const ROWS = 5;
const MARGIN = 20;
const LABEL_PX = 16;
const INFO_PX = 130;
const CELL_W = INFO_PX + 12 + ZOOM_PX;
const CELL_H = LABEL_PX + ZOOM_PX;
const PAGE_W = COLUMNS * CELL_W + (COLUMNS + 1) * MARGIN;
const PAGE_H = ROWS * CELL_H + (ROWS + 1) * MARGIN;
const FONT = "font-family=\"'Noto Sans', 'DejaVu Sans', sans-serif\"";

// ---------------------------------------------------------------------------------------------
// TopoJSON decoding (the few lines of topojson-client the sheet needs, so it adds no dependency).
interface TopoGeometry {
  type: string;
  arcs?: unknown;
  properties?: Record<string, unknown> | null;
}
interface TopoJson {
  arcs: number[][][];
  transform?: { scale: [number, number]; translate: [number, number] };
  objects: Record<string, { geometries: TopoGeometry[] }>;
}

/** The arcs as lon/lat points: delta-decoded and de-quantized when the topology is quantized. */
export function decodeArcs(topology: TopoJson): Pt[][] {
  const { transform } = topology;
  return topology.arcs.map((arc) => {
    let x = 0;
    let y = 0;
    return arc.map(([dx = 0, dy = 0]): Pt => {
      if (!transform) return [dx, dy];
      x += dx;
      y += dy;
      return [
        x * transform.scale[0] + transform.translate[0],
        y * transform.scale[1] + transform.translate[1],
      ];
    });
  });
}

function ringOf(arcs: Pt[][], indexes: number[]): Ring {
  const ring: Ring = [];
  for (const index of indexes) {
    const arc = index < 0 ? [...(arcs[~index] ?? [])].reverse() : (arcs[index] ?? []);
    // An arc starts where the previous one ended: that point is already in the ring.
    for (const point of ring.length > 0 ? arc.slice(1) : arc) ring.push(point);
  }
  return ring;
}

/** Polygons of a geometry, each as [exterior, ...holes]; anything but (Multi)Polygon is empty. */
function geometryPolygons(arcs: Pt[][], geometry: TopoGeometry): Ring[][] {
  if (geometry.type === 'Polygon') {
    return [(geometry.arcs as number[][]).map((ring) => ringOf(arcs, ring))];
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.arcs as number[][][]).map((polygon) =>
      polygon.map((ring) => ringOf(arcs, ring)),
    );
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// Projection.
const wrapLon = (degrees: number): number => ((((degrees + 180) % 360) + 360) % 360) - 180;

/**
 * The longitude to centre a subject on: opposite the middle of the widest band of longitudes that
 * holds no vertex. The antimeridian then falls in empty space, whichever side of 180 the land is.
 */
export function centralLongitude(lons: number[]): number {
  const sorted = [...lons].sort((a, b) => a - b);
  const first = sorted[0];
  if (first === undefined) return 0;
  let widest = -1;
  let middle = 0;
  for (const [i, lon] of sorted.entries()) {
    const next = sorted[i + 1] ?? first + 360;
    if (next - lon > widest) {
      widest = next - lon;
      middle = lon + widest / 2;
    }
  }
  return wrapLon(middle + 180);
}

interface Poly {
  rings: Ring[];
  bbox: Box;
}

const ringBox = (ring: Ring): Box => {
  const box: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of ring) {
    box[0] = Math.min(box[0], x);
    box[1] = Math.min(box[1], y);
    box[2] = Math.max(box[2], x);
    box[3] = Math.max(box[3], y);
  }
  return box;
};

const unionBox = (boxes: Box[]): Box => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

const ringArea = (ring: Ring): number => {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i] ?? [0, 0];
    const [x1, y1] = ring[i + 1] ?? [0, 0];
    sum += x0 * y1 - x1 * y0;
  }
  return Math.abs(sum) / 2;
};

/** Planar area of a polygon, holes taken off. */
const polyArea = (poly: Poly): number =>
  poly.rings.reduce((sum, ring, i) => sum + (i === 0 ? 1 : -1) * ringArea(ring), 0);

/** Size of the main landmass: the polygons holding at least 1 % of the area (as `mainBbox` does). */
export function mainExtent(polys: Poly[]): number {
  const areas = polys.map((p) => ringArea(p.rings[0] ?? []));
  const total = areas.reduce((a, b) => a + b, 0);
  const main = polys.filter((_, i) => (areas[i] ?? 0) >= total * 0.01);
  const [x0, y0, x1, y1] = unionBox((main.length > 0 ? main : polys).map((p) => p.bbox));
  return Math.max(x1 - x0, y1 - y0);
}

/**
 * A test for "within `reach` of one of the rings", from samples every `reach / 2` along them on a
 * grid of `reach`-wide cells: close enough for telling a border from a coast.
 */
export function nearRings(rings: Ring[], reach: number): (x: number, y: number) => boolean {
  const cells = new Map<string, Pt[]>();
  const add = (x: number, y: number): void => {
    const key = `${Math.floor(x / reach)},${Math.floor(y / reach)}`;
    const cell = cells.get(key);
    if (cell) cell.push([x, y]);
    else cells.set(key, [[x, y]]);
  };
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i] ?? [0, 0];
      const [x1, y1] = ring[i + 1] ?? [0, 0];
      const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (reach / 2)));
      for (let s = 0; s < steps; s++)
        add(x0 + ((x1 - x0) * s) / steps, y0 + ((y1 - y0) * s) / steps);
    }
  }
  return (x, y) => {
    const ix = Math.floor(x / reach);
    const iy = Math.floor(y / reach);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        for (const [px, py] of cells.get(`${ix + dx},${iy + dy}`) ?? []) {
          if (Math.hypot(px - x, py - y) <= reach) return true;
        }
      }
    }
    return false;
  };
}

// ---------------------------------------------------------------------------------------------
// The zoom window.
export interface ZoomWindow {
  /** Centre of the window, in projected units. */
  x: number;
  y: number;
  /** Coastline length in the window over its side. */
  score: number;
}

/**
 * The `size`-wide window holding the most ring length per unit of width (see the file header), or
 * `null` when the rings have no segment. Pieces of ring whose midpoint `skip` accepts are not counted.
 */
export function pickZoomWindow(
  rings: Ring[],
  size: number,
  skip: (x: number, y: number) => boolean = () => false,
): ZoomWindow | null {
  const cell = size / 2;
  const cells = new Map<string, number>();
  const midpoints: { x: number; y: number; length: number; ix: number; iy: number }[] = [];
  for (const ring of rings) {
    for (let i = 0; i < ring.length - 1; i++) {
      const [x0, y0] = ring[i] ?? [0, 0];
      const [x1, y1] = ring[i + 1] ?? [0, 0];
      const total = Math.hypot(x1 - x0, y1 - y0);
      if (total === 0) continue;
      // A long segment is credited piece by piece (none longer than half a cell) to the cells it
      // crosses, not all to the cell of its middle.
      const steps = Math.max(1, Math.ceil(total / (cell / 2)));
      for (let s = 0; s < steps; s++) {
        const t = (s + 0.5) / steps;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        if (skip(x, y)) continue;
        const ix = Math.floor(x / cell);
        const iy = Math.floor(y / cell);
        const length = total / steps;
        cells.set(`${ix},${iy}`, (cells.get(`${ix},${iy}`) ?? 0) + length);
        midpoints.push({ x, y, length, ix, iy });
      }
    }
  }
  const at = (ix: number, iy: number): number => cells.get(`${ix},${iy}`) ?? 0;
  // Candidate blocks, by (row, column) of their lower-left cell: the order that breaks ties.
  const blocks = new Set<string>();
  for (const { ix, iy } of midpoints) {
    for (const dy of [-1, 0]) for (const dx of [-1, 0]) blocks.add(`${ix + dx},${iy + dy}`);
  }
  let best: { ix: number; iy: number; length: number } | null = null;
  const ordered = [...blocks]
    .map((key) => key.split(',').map(Number) as [number, number])
    .sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  for (const [ix, iy] of ordered) {
    const length = at(ix, iy) + at(ix + 1, iy) + at(ix, iy + 1) + at(ix + 1, iy + 1);
    if (length > (best?.length ?? 0)) best = { ix, iy, length };
  }
  if (!best) return null;
  const inside = midpoints.filter(
    (m) => m.ix >= best.ix && m.ix <= best.ix + 1 && m.iy >= best.iy && m.iy <= best.iy + 1,
  );
  return {
    x: inside.reduce((s, m) => s + m.x * m.length, 0) / best.length,
    y: inside.reduce((s, m) => s + m.y * m.length, 0) / best.length,
    score: best.length / size,
  };
}

// ---------------------------------------------------------------------------------------------
// A subject, projected.
interface Subject {
  id: string;
  name: string;
  landSource: string;
  land: Poly[];
  regions: Poly[][];
  /** Rings of the neighbouring countries' land (context layer), for telling borders from coast. */
  neighbours: Ring[];
  /** Projected x = (lon - lon0) wrapped, times `kx`; projected y = lat. */
  lon0: number;
  kx: number;
}

export function loadSubject(entry: MapIndex['subjects'][number], topology: TopoJson): Subject {
  const arcs = decodeArcs(topology);
  const polygonsOf = (name: string): Ring[][] =>
    (topology.objects[name]?.geometries ?? []).flatMap((g) => geometryPolygons(arcs, g));
  const landLonLat = polygonsOf('land');
  const regionsLonLat = (topology.objects.regions?.geometries ?? []).map((g) =>
    geometryPolygons(arcs, g),
  );
  const reference = landLonLat.length > 0 ? landLonLat : regionsLonLat.flat();
  const points = reference.flatMap((polygon) => polygon[0] ?? []);
  const lon0 = centralLongitude(points.map(([lon]) => lon));
  let south = Infinity;
  let north = -Infinity;
  for (const [, lat] of points) {
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const kx = Math.cos((((south + north) / 2) * Math.PI) / 180) || 1;
  const project = (polygon: Ring[]): Poly => {
    const rings = polygon.map((ring) =>
      ring.map(([lon, lat]): Pt => [wrapLon(lon - lon0) * kx, lat]),
    );
    return { rings, bbox: ringBox(rings[0] ?? []) };
  };
  return {
    id: entry.id,
    name: entry.name,
    landSource: entry.landSource ?? '?',
    land: landLonLat.map(project),
    regions: regionsLonLat.map((polygons) => polygons.map(project)),
    neighbours: polygonsOf('neighbours').flatMap((polygon) => project(polygon).rings),
    lon0,
    kx,
  };
}

// ---------------------------------------------------------------------------------------------
// Drawing.
interface View {
  /** Projected point at the centre of the tile. */
  x: number;
  y: number;
  /** Pixels per projected unit. */
  scale: number;
  size: number;
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** SVG path data of the polygons that touch the view, in tile pixels. */
function pathData(polys: Poly[], view: View): string {
  const half = view.size / 2 / view.scale;
  const out: string[] = [];
  for (const poly of polys) {
    const [x0, y0, x1, y1] = poly.bbox;
    if (x1 < view.x - half || x0 > view.x + half || y1 < view.y - half || y0 > view.y + half) {
      continue;
    }
    for (const ring of poly.rings) {
      const points = ring.map(
        ([x, y]) =>
          `${((x - view.x) * view.scale + view.size / 2).toFixed(1)} ${((view.y - y) * view.scale + view.size / 2).toFixed(1)}`,
      );
      out.push(`M${points.join('L')}Z`);
    }
  }
  return out.join('');
}

/** One tile as a nested <svg>: land under regions, then the land outline. */
function tileSvg(subject: Subject, view: View, strokes: { land: number; regions: number }): string {
  const hasRegions = subject.regions.length > 0;
  const land = pathData(subject.land, view);
  let svg = `<rect width="${view.size}" height="${view.size}" fill="${PAPER}"/>`;
  svg += `<path d="${land}" fill="${hasRegions ? GAP : ARDOISE.fill}" fill-rule="evenodd"/>`;
  for (const [i, polys] of subject.regions.entries()) {
    const d = pathData(polys, view);
    if (d === '') continue;
    svg +=
      `<path d="${d}" fill="${REGION_SHADES[i % REGION_SHADES.length]}" fill-rule="evenodd" ` +
      `stroke="${ARDOISE.stroke}" stroke-width="${strokes.regions}" stroke-linejoin="round"/>`;
  }
  svg += `<path d="${land}" fill="none" stroke="${ARDOISE.stroke}" stroke-width="${strokes.land}" stroke-linejoin="round"/>`;
  return svg;
}

const nested = (x: number, y: number, size: number, inner: string): string =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}</svg>` +
  `<rect x="${x + 0.5}" y="${y + 0.5}" width="${size - 1}" height="${size - 1}" fill="none" stroke="${FRAME}"/>`;

const text = (x: number, y: number, size: number, body: string, weight = 400): string =>
  `<text x="${x}" y="${y}" ${FONT} font-size="${size}" font-weight="${weight}" fill="${INK}">${esc(body)}</text>`;

interface Cell {
  svg: string;
  summary: string;
}

/** The cell of one subject, with its top-left corner at (x, y). */
export function cellOf(subject: Subject, x: number, y: number): Cell {
  const all = subject.land.length > 0 ? subject.land : subject.regions.flat();
  const [x0, y0, x1, y1] = unionBox(all.map((p) => p.bbox));
  const overview: View = {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    scale: (OVERVIEW_PX - 2 * OVERVIEW_PAD) / (Math.max(x1 - x0, y1 - y0) || 1),
    size: OVERVIEW_PX,
  };
  const side = ZOOM_FRACTION * mainExtent(all);
  const reach = (BORDER_REACH * toleranceMetres(mainExtent(all) * 111.2)) / 111_200;
  const window = pickZoomWindow(
    all.flatMap((p) => p.rings),
    side,
    nearRings(subject.neighbours, reach),
  );
  const zoom: View = {
    x: window?.x ?? overview.x,
    y: window?.y ?? overview.y,
    scale: ZOOM_PX / (side || 1),
    size: ZOOM_PX,
  };

  const landArea = subject.land.reduce((s, p) => s + polyArea(p), 0);
  const regionArea = subject.regions.flat().reduce((s, p) => s + polyArea(p), 0);
  const cover = landArea > 0 && subject.regions.length > 0 ? regionArea / landArea : null;
  const lon = wrapLon(zoom.x / subject.kx + subject.lon0);
  const kmWide = Math.round(side * 111.2);
  const where = `${Math.abs(zoom.y).toFixed(1)}${zoom.y < 0 ? 'S' : 'N'} ${Math.abs(lon).toFixed(1)}${lon < 0 ? 'W' : 'E'}`;

  const ovX = x;
  const ovY = y + LABEL_PX;
  const zmX = x + INFO_PX + 12;
  const frame = side * overview.scale;
  const mark =
    `<rect x="${(ovX + OVERVIEW_PX / 2 + (zoom.x - overview.x) * overview.scale - frame / 2).toFixed(1)}" ` +
    `y="${(ovY + OVERVIEW_PX / 2 - (zoom.y - overview.y) * overview.scale - frame / 2).toFixed(1)}" ` +
    `width="${frame.toFixed(1)}" height="${frame.toFixed(1)}" fill="none" stroke="${ARDOISE.marker}" stroke-width="1.2"/>`;
  const name = subject.name.length > 22 ? `${subject.name.slice(0, 21)}…` : subject.name;
  const info = [
    name,
    `${subject.regions.length} regions`,
    `${subject.land.length} land polygons`,
    cover === null ? 'no regions' : `regions/land ${(cover * 100).toFixed(1)} %`,
    `land: ${subject.landSource}`,
    `zoom ${kmWide} km wide`,
    where,
  ];

  let svg = text(ovX, y + 12, 12, subject.id, 700);
  svg += nested(ovX, ovY, OVERVIEW_PX, tileSvg(subject, overview, STROKES.overview)) + mark;
  svg += info.map((line, i) => text(ovX, ovY + OVERVIEW_PX + 14 + i * 12, 9, line)).join('');
  svg += text(zmX, y + 12, 12, `${subject.id} zoom`, 700);
  svg += nested(zmX, ovY, ZOOM_PX, tileSvg(subject, zoom, STROKES.zoom));
  return {
    svg,
    summary:
      `${subject.id.padEnd(7)} regions=${subject.regions.length} polygons=${subject.land.length} ` +
      `cover=${cover === null ? '-' : `${(cover * 100).toFixed(1)}%`} zoom=${where} ${kmWide}km ` +
      `score=${(window?.score ?? 0).toFixed(1)}`,
  };
}

// ---------------------------------------------------------------------------------------------
// Pages and CLI.
export async function renderSheet(ids: string[] | 'all', outDir: string): Promise<string[]> {
  const mapsDir = appFileUrl('resources/maps');
  const index = JSON.parse(await readFile(join(mapsDir, 'index.json'), 'utf8')) as MapIndex;
  const entries =
    ids === 'all'
      ? index.subjects
      : ids.map((id) => {
          const entry = index.subjects.find((s) => s.id === id);
          if (!entry) throw new Error(`unknown subject ${id} (index.json has no such id)`);
          return entry;
        });
  await mkdir(outDir, { recursive: true });
  for (const file of await readdir(outDir)) {
    if (/^sheet-\d+\.png$/.test(file)) await rm(join(outDir, file));
  }
  const perPage = COLUMNS * ROWS;
  const pages: string[] = [];
  for (let start = 0; start < entries.length; start += perPage) {
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}" viewBox="0 0 ${PAGE_W} ${PAGE_H}">`;
    svg += `<rect width="${PAGE_W}" height="${PAGE_H}" fill="#ffffff"/>`;
    for (const [n, entry] of entries.slice(start, start + perPage).entries()) {
      const topology = JSON.parse(await readFile(join(mapsDir, entry.file), 'utf8')) as TopoJson;
      const x = MARGIN + (n % COLUMNS) * (CELL_W + MARGIN);
      const y = MARGIN + Math.floor(n / COLUMNS) * (CELL_H + MARGIN);
      const cell = cellOf(loadSubject(entry, topology), x, y);
      svg += cell.svg;
      console.log(cell.summary);
    }
    const file = join(outDir, `sheet-${String(pages.length + 1).padStart(2, '0')}.png`);
    await sharp(Buffer.from(`${svg}</svg>`), { unlimited: true })
      .png()
      .toFile(file);
    pages.push(file);
  }
  return pages;
}

if (process.argv[1]?.endsWith('render-sheet.ts')) {
  const [ids, outDir] = process.argv.slice(2);
  if (!ids || !outDir) {
    console.error('usage: node scripts/maps/render-sheet.ts <ids|all> <outDir>');
    process.exit(1);
  }
  const pages = await renderSheet(
    ids === 'all'
      ? 'all'
      : ids
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean),
    outDir,
  );
  for (const page of pages) console.log(page);
}

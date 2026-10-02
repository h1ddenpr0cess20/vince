import { canvas2d, impasto, lay, mix, pick, rgb, seeded, trace, vary } from '../paint/brush.js';
import { CANVAS, helixAt, lobeAt, locate, reliefAt, smooth } from './pinna.js';

const SIZE = 1024;
const STROKES = 6500;
const UNDERPAINT = 900;
const GRID = 128;

const INERT = { map: null, bumpMap: null };

const SKIN = {
  light: rgb('#f3cda4'),
  mid: rgb('#dc9a78'),
  warm: rgb('#c77a5a'),
  deep: rgb('#8b4431'),
  hollow: rgb('#2f1a26'),
  flush: rgb('#e6857a'),
};

/** Neighbouring notes the brush picks up on the way, so no two strokes of skin are one colour. */
const NOTES = [rgb('#f0c08f'), rgb('#e59a82'), rgb('#f5d6b4'), rgb('#d48a70'), rgb('#e8b07e')];

/** The colours a portrait of his would have hidden in the skin: viridian, cobalt, a little chrome yellow. */
const ACCENTS = [rgb('#5b8a6a'), rgb('#4b66a3'), rgb('#e6c158')];

/** The dark line he drew round things. */
const CONTOUR = [rgb('#2b386b'), rgb('#3a4985'), rgb('#4f3559')];

/**
 * The relief, sampled once over the canvas, so every stroke can ask which way
 * the fold under it runs without measuring the ear again.
 */
function sampleRelief() {
  const heights = new Float32Array(GRID * GRID);
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const x = CANVAS.x + (i / (GRID - 1)) * CANVAS.size;
      const y = CANVAS.y + (1 - j / (GRID - 1)) * CANVAS.size;
      heights[j * GRID + i] = reliefAt(x, y);
    }
  }
  const at = (i, j) => heights[Math.max(0, Math.min(GRID - 1, j)) * GRID + Math.max(0, Math.min(GRID - 1, i))];
  return {
    /** Height and downhill slope at a point given as 0..1 across the canvas. */
    read(u, v) {
      const i = Math.round(u * (GRID - 1));
      const j = Math.round(v * (GRID - 1));
      return { height: at(i, j), gx: at(i + 1, j) - at(i - 1, j), gy: at(i, j + 1) - at(i, j - 1) };
    },
  };
}

/**
 * Vince's skin: oil on canvas, laid on the way the man he came off would have
 * — short loaded strokes running along the folds rather than across them,
 * darker into the bowl, warmer where the blood is, and a blue line round the
 * rim. Painted once onto two canvases: the colour, and the ridges of paint as
 * a bump map.
 */
export function createImpasto(GFX, { size = SIZE, strokes = STROKES, seed = 1888 } = {}) {
  const colour = canvas2d(size, size);
  const bump = canvas2d(size, size);
  if (!colour || !bump) return INERT;

  const random = seeded(seed);
  const relief = sampleRelief();
  const g = colour.ctx;
  const b = bump.ctx;
  const scale = size / SIZE;

  g.fillStyle = 'rgb(220,154,120)';
  g.fillRect(0, 0, size, size);
  b.fillStyle = '#808080';
  b.fillRect(0, 0, size, size);

  const world = (px, py) => [CANVAS.x + (px / size) * CANVAS.size, CANVAS.y + (1 - py / size) * CANVAS.size];

  /** Along the fold where there is one, round the bowl where it is flat. */
  const flow = (px, py) => {
    const [x, y] = world(px, py);
    const { gx, gy } = relief.read(px / size, py / size);
    const steep = Math.hypot(gx, gy);
    const rx = x + 0.10;
    const ry = y + 0.06;
    const r = Math.hypot(rx, ry) || 1;
    const w = smooth(0.002, 0.02, steep);
    const ax = steep ? -gy / steep : 0;
    const ay = steep ? gx / steep : 0;
    const tx = ry / r;
    const ty = rx / r;
    const dx = ax * w + tx * (1 - w);
    const dy = ay * w + ty * (1 - w);
    const length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length];
  };

  /** What the brush is loaded with at a point: depth first, then blood, then a stray note. */
  const load = (px, py) => {
    const [x, y] = world(px, py);
    const { s, edge, theta } = locate(x, y);
    const { height } = relief.read(px / size, py / size);

    let c;
    if (height < -0.1) c = mix(SKIN.hollow, SKIN.deep, smooth(-0.17, -0.1, height));
    else if (height < 0) c = mix(SKIN.deep, SKIN.warm, smooth(-0.1, 0, height));
    else c = mix(SKIN.mid, SKIN.light, smooth(0.03, 0.11, height));

    if (height > -0.06) c = mix(c, pick(NOTES, random), 0.2 + random() * 0.2);
    if (s > 1) c = mix(c, pick(CONTOUR, random), 0.65 * smooth(1, 1.05, s));
    c = mix(c, SKIN.flush, 0.4 * helixAt(theta) * smooth(0.12, 0, edge) + 0.3 * lobeAt(y));
    if (random() < (height < 0.02 ? 0.05 : 0.02)) c = mix(c, pick(ACCENTS, random), 0.35);
    return vary(c, 0.09, random);
  };

  const dab = (length, width) => {
    const px = random() * size;
    const py = random() * size;
    const [x, y] = world(px, py);
    if (locate(x, y).s > 1.14) return;
    const points = trace(px, py, flow, length, 3);
    lay(g, points, width, load(px, py), random);
    impasto(b, points, width, random);
  };

  for (let i = 0; i < UNDERPAINT; i++) dab((34 + random() * 22) * scale, (13 + random() * 8) * scale);
  for (let i = 0; i < strokes; i++) dab((15 + random() * 20) * scale, (4.5 + random() * 4.5) * scale);

  const map = new GFX.CanvasTexture(colour.el);
  map.colorSpace = GFX.SRGBColorSpace;
  map.anisotropy = 4;
  const bumpMap = new GFX.CanvasTexture(bump.el);

  return { map, bumpMap };
}

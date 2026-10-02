/**
 * The ear. A left one — the one that went missing in Arles — so the face it
 * came off would be off to the left (-x): the helix curls over the top and
 * down the back, the tragus sits at the front over the canal, and the lobe
 * hangs underneath.
 *
 * It is built flat, in the xy plane facing +z and about 1.5 tall: a closed
 * outline, a relief pressed into the front of it, and a rolled rim joining
 * that to a plainer back. All of it is plain maths with nothing random in it,
 * so Vince is the same ear on every load.
 */

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function smooth(edge0, edge1, x) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** A rounded hump that is exactly flat by `radius`, so features never leak. */
export function bump(distance, radius = 1) {
  const d = distance / radius;
  return d >= 1 ? 0 : (1 - d * d) ** 2;
}

function crSpline(p0, p1, p2, p3, f) {
  const f2 = f * f;
  return 0.5 * (2 * p1 + (p2 - p0) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2
    + (3 * p1 - p0 - 3 * p2 + p3) * f2 * f);
}

/** Counter-clockwise seen from the front, which is what makes the faces face out. */
function counterClockwise(points) {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[(i + 1) % points.length];
    area += x0 * y1 - x1 * y0;
  }
  return area < 0 ? [...points].reverse() : points;
}

/** The silhouette: helix root, over the top, down the back, under the lobe, in at the notch, up the tragus. */
const OUTLINE = counterClockwise([
  [-0.30, 0.44],
  [-0.20, 0.63],
  [-0.02, 0.75],
  [0.20, 0.72],
  [0.37, 0.56],
  [0.44, 0.32],
  [0.43, 0.06],
  [0.36, -0.18],
  [0.25, -0.35],
  [0.18, -0.48],
  [0.15, -0.62],
  [0.02, -0.74],
  [-0.13, -0.68],
  [-0.20, -0.52],
  [-0.23, -0.37],
  [-0.32, -0.26],
  [-0.37, -0.10],
  [-0.37, 0.18],
]);

/** The bottom of the concha: the rings of the mesh are drawn about it. */
export const CENTRE = Object.freeze([-0.10, -0.06]);

/** A point on the closed outline, 0 ≤ t < 1 once round. */
export function outlineAt(t) {
  const n = OUTLINE.length;
  const u = (((t % 1) + 1) % 1) * n;
  const i = Math.floor(u);
  const f = u - i;
  const p = (k) => OUTLINE[(i + k + n) % n];
  return [
    crSpline(p(-1)[0], p(0)[0], p(1)[0], p(2)[0], f),
    crSpline(p(-1)[1], p(0)[1], p(1)[1], p(2)[1], f),
  ];
}

/** An open spline through a ridge's control points, sampled finely enough to measure against. */
function ridge(points, steps = 20) {
  const out = [];
  const last = points.length - 1;
  for (let i = 0; i < last; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(last, i + 2)];
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      out.push([crSpline(p0[0], p1[0], p2[0], p3[0], f), crSpline(p0[1], p1[1], p2[1], p3[1], f)]);
    }
  }
  out.push(points[last]);
  return out;
}

/** The fold inside the helix: up the back of the concha, then forward as the superior crus. */
const ANTIHELIX = ridge([[0.04, -0.25], [0.17, -0.12], [0.22, 0.05], [0.20, 0.22], [0.10, 0.38], [-0.06, 0.47]]);
/** The lower branch of the antihelix, running forward over the concha. */
const INFERIOR_CRUS = ridge([[0.19, 0.17], [0.06, 0.22], [-0.10, 0.23]]);
/** Where the helix dives in from the front and fades into the bowl. */
const HELIX_CRUS = ridge([[-0.31, 0.40], [-0.22, 0.24], [-0.12, 0.12]]);

/** Distance to a sampled ridge, and how far along it the nearest point is (0..1). */
function along(x, y, line) {
  let best = Infinity;
  let at = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const [ax, ay] = line[i];
    const [bx, by] = line[i + 1];
    const dx = bx - ax;
    const dy = by - ay;
    const f = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    const d = Math.hypot(x - ax - f * dx, y - ay - f * dy);
    if (d < best) {
      best = d;
      at = (i + f) / (line.length - 1);
    }
  }
  return { distance: best, at };
}

/** A raised fold that swells in from nothing at both ends. */
function fold(x, y, line, height, width) {
  const { distance, at } = along(x, y, line);
  return height * bump(distance, width) * smooth(0, 0.18, at) * (1 - smooth(0.82, 1, at));
}

const oval = (x, y, cx, cy, rx, ry) => Math.hypot((x - cx) / rx, (y - cy) / ry);

/** How much of the rim at this angle (about CENTRE) is helix — the top and back, not the lobe or the front. */
export function helixAt(theta) {
  return smooth(-1.15, -0.65, theta) * (1 - smooth(1.8, 2.3, theta));
}

/** How much of this point is lobe: soft, fleshy, and without any folds. */
export function lobeAt(y) {
  return smooth(-0.34, -0.52, y);
}

/**
 * The front face: height above the plane at (x, y), given how far in from the
 * rim the point is and the angle of the rim it is nearest.
 */
export function relief(x, y, edge = 1, theta = 0) {
  let h = 0.03;
  const helix = helixAt(theta);
  h += 0.1 * helix * bump(Math.abs(edge - 0.035), 0.065);
  h -= 0.022 * helix * bump(Math.abs(edge - 0.12), 0.05);
  h += fold(x, y, ANTIHELIX, 0.085, 0.075);
  h += fold(x, y, INFERIOR_CRUS, 0.055, 0.05);
  h += fold(x, y, HELIX_CRUS, 0.045, 0.045);
  h -= 0.025 * bump(Math.hypot(x - 0.03, y - 0.33), 0.09);
  h += 0.075 * bump(oval(x, y, -0.29, -0.10, 0.10, 0.15));
  h += 0.05 * bump(oval(x, y, 0.03, -0.26, 0.12, 0.08));
  h -= 0.15 * bump(oval(x, y, -0.10, -0.06, 0.18, 0.20));
  h -= 0.10 * bump(oval(x, y, -0.19, -0.07, 0.10, 0.11));

  const lobe = 0.035 + 0.03 * bump(Math.hypot(x + 0.06, y + 0.58), 0.2);
  const w = lobeAt(y);
  return h * (1 - w) + lobe * w;
}

/** Thinnest the ear is allowed to get between its two faces. */
export const MIN_THICKNESS = 0.035;

/** Polynomial smooth minimum, so where the back gives way to the front it does not crease. */
function smin(a, b, k) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/**
 * The back face, as a height below the plane: a shallow dome with the bulge
 * of the concha behind the bowl. The bulge is wide and deep enough to hold
 * the canal on its own; the clamp to the front is only a safety net, because
 * where it bites it drags the back into a spike behind the canal.
 */
export function backing(x, y, s, front) {
  let h = -0.035 - 0.05 * (1 - s * s);
  h -= 0.16 * bump(oval(x, y, -0.12, -0.055, 0.26, 0.28));
  const lobe = -0.035 - 0.03 * bump(Math.hypot(x + 0.06, y + 0.58), 0.2);
  const w = lobeAt(y);
  h = h * (1 - w) + lobe * w;
  return smin(h, front - MIN_THICKNESS, 0.03);
}

/** Outline angle about CENTRE → which way the rim runs there, for `locate`. */
const LOOKUP = (() => {
  const samples = 4096;
  const table = [];
  for (let i = 0; i < samples; i++) {
    const [x, y] = outlineAt(i / samples);
    table.push({ angle: Math.atan2(y - CENTRE[1], x - CENTRE[0]), reach: Math.hypot(x - CENTRE[0], y - CENTRE[1]) });
  }
  table.sort((a, b) => a.angle - b.angle);
  return table;
})();

/**
 * Where an arbitrary point sits on the ear: `s` is 0 at CENTRE and 1 on the
 * rim, `edge` how far in from the rim it is, `theta` the angle about CENTRE.
 * Used to paint the skin to the same folds the mesh is pressed into.
 */
export function locate(x, y) {
  const theta = Math.atan2(y - CENTRE[1], x - CENTRE[0]);
  let lo = 0;
  let hi = LOOKUP.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (LOOKUP[mid].angle < theta) lo = mid + 1;
    else hi = mid;
  }
  const reach = LOOKUP[lo].reach;
  const r = Math.hypot(x - CENTRE[0], y - CENTRE[1]);
  return { s: r / reach, edge: reach - r, theta };
}

/** The relief at any point, looked up rather than handed its place on the rim. */
export function reliefAt(x, y) {
  const { edge, theta } = locate(x, y);
  return relief(x, y, edge, theta);
}

/** The square of the plane the skin is painted over: the ear and its rim, with room to spare. */
export const CANVAS = Object.freeze({ x: -0.52, y: -0.90, size: 1.80 });

/**
 * The mesh, as raw arrays: one vertex at the bottom of the concha, rings out
 * to the rim across the front, a half-turn of rings over the edge, rings back
 * in across the back, and one vertex behind the bowl.
 */
export function buildPinna({ columns = 224, front = 72, roll = 16, back = 36 } = {}) {
  const rim = [];
  for (let j = 0; j < columns; j++) {
    const t = j / columns;
    const [x, y] = outlineAt(t);
    const [ax, ay] = outlineAt(t - 1e-3);
    const [bx, by] = outlineAt(t + 1e-3);
    const tx = bx - ax;
    const ty = by - ay;
    const length = Math.hypot(tx, ty);
    rim.push({
      x, y,
      nx: ty / length,
      ny: -tx / length,
      theta: Math.atan2(y - CENTRE[1], x - CENTRE[0]),
    });
  }

  const positions = [];
  const uvs = [];
  const put = (x, y, z) => {
    positions.push(x, y, z);
    uvs.push((x - CANVAS.x) / CANVAS.size, (y - CANVAS.y) / CANVAS.size);
  };

  const [cx, cy] = CENTRE;
  const centreFront = relief(cx, cy, 1, 0);
  put(cx, cy, centreFront);

  const across = (s, column) => {
    const x = cx + (column.x - cx) * s;
    const y = cy + (column.y - cy) * s;
    const reach = Math.hypot(column.x - cx, column.y - cy);
    return { x, y, front: relief(x, y, (1 - s) * reach, column.theta) };
  };

  for (let i = 1; i <= front; i++) {
    for (const column of rim) {
      const p = across(i / front, column);
      put(p.x, p.y, p.front);
    }
  }

  for (let k = 1; k < roll; k++) {
    const phi = (Math.PI * k) / roll;
    for (const column of rim) {
      const top = relief(column.x, column.y, 0, column.theta);
      const bottom = backing(column.x, column.y, 1, top);
      const middle = (top + bottom) / 2;
      const radius = (top - bottom) / 2;
      const out = radius * Math.sin(phi);
      put(column.x + column.nx * out, column.y + column.ny * out, middle + radius * Math.cos(phi));
    }
  }

  for (let i = back; i >= 1; i--) {
    const s = i / back;
    for (const column of rim) {
      const p = across(s, column);
      put(p.x, p.y, backing(p.x, p.y, s, p.front));
    }
  }

  put(cx, cy, backing(cx, cy, 0, centreFront));

  const rings = front + (roll - 1) + back;
  const last = positions.length / 3 - 1;
  const at = (ring, j) => 1 + ring * columns + (j % columns);
  const indices = [];

  for (let j = 0; j < columns; j++) indices.push(0, at(0, j), at(0, j + 1));
  for (let r = 0; r < rings - 1; r++) {
    for (let j = 0; j < columns; j++) {
      const a = at(r, j);
      const b = at(r, j + 1);
      const c = at(r + 1, j);
      const d = at(r + 1, j + 1);
      indices.push(a, c, d, a, d, b);
    }
  }
  for (let j = 0; j < columns; j++) indices.push(at(rings - 1, j), last, at(rings - 1, j + 1));

  return { positions, uvs, indices };
}

/** The ear stands the way it hung: leaning back a little from upright. */
export const TILT = -0.16;

export function createPinna(GFX, skin, options) {
  const { positions, uvs, indices } = buildPinna(options);
  const geometry = new GFX.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', new GFX.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new GFX.Float32BufferAttribute(uvs, 2));
  geometry.rotateZ(TILT);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const material = new GFX.MeshPhysicalMaterial({
    name: 'impasto',
    color: new GFX.Color(skin.map ? '#ffffff' : '#d9987a'),
    map: skin.map,
    bumpMap: skin.bumpMap,
    bumpScale: 1.6,
    roughness: 0.48,
    metalness: 0,
    clearcoat: 0.45,
    clearcoatRoughness: 0.42,
    sheen: 0.25,
    sheenColor: new GFX.Color('#ffd8c2'),
  });

  const mesh = new GFX.Mesh(geometry, material);
  mesh.name = 'pinna';

  return { mesh, geometry, material, foot: geometry.boundingBox.min.y };
}

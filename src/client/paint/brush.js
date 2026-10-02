/**
 * The brush both paintings are made with — Vince's skin and the landscape
 * behind him. Short, loaded strokes that follow a flow field, laid in colour
 * and pressed into a bump map as ridges, which is the impasto.
 */

/** mulberry32: small, fast, and the same strokes in the same places every load. */
export function seeded(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function canvas2d(width, height) {
  if (typeof document === 'undefined') return null;
  const el = document.createElement('canvas');
  el.width = width;
  el.height = height;
  const ctx = el.getContext('2d');
  return ctx ? { el, ctx } : null;
}

export function rgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Lighter or darker by up to `amount`, the way no two loads of a brush match. */
export function vary(colour, amount, random) {
  const k = 1 + (random() * 2 - 1) * amount;
  return colour.map((c) => Math.max(0, Math.min(255, c * k)));
}

export const css = ([r, g, b], alpha = 1) =>
  `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;

export function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

/**
 * A stroke's path: from the middle, half its length each way along the field.
 * The field is a direction, not an arrow, so each step keeps to the way the
 * last one was going rather than doubling back.
 */
export function trace(x, y, flow, length, steps = 3) {
  const [ix, iy] = flow(x, y);
  const half = (sign) => {
    const out = [];
    let px = x;
    let py = y;
    let lx = ix * sign;
    let ly = iy * sign;
    const step = length / 2 / steps;
    for (let i = 0; i < steps; i++) {
      let [dx, dy] = flow(px, py);
      if (dx * lx + dy * ly < 0) {
        dx = -dx;
        dy = -dy;
      }
      px += dx * step;
      py += dy * step;
      lx = dx;
      ly = dy;
      out.push([px, py]);
    }
    return out;
  };
  return [...half(-1).reverse(), [x, y], ...half(1)];
}

function path(ctx, points) {
  ctx.beginPath();
  ctx.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const [lx, ly] = points[points.length - 1];
  ctx.lineTo(lx, ly);
}

/** The same path, shifted sideways — a bristle's track down one side of the stroke. */
function offset(points, by) {
  return points.map(([x, y], i) => {
    const [ax, ay] = points[Math.max(0, i - 1)];
    const [bx, by2] = points[Math.min(points.length - 1, i + 1)];
    const dx = bx - ax;
    const dy = by2 - ay;
    const length = Math.hypot(dx, dy) || 1;
    return [x - (dy / length) * by, y + (dx / length) * by];
  });
}

/** One loaded stroke in colour, with the bristles dragged through it. */
export function lay(ctx, points, width, colour, random) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = css(colour);
  path(ctx, points);
  ctx.stroke();

  ctx.lineWidth = Math.max(0.6, width * 0.12);
  for (const side of [-0.28, 0.3]) {
    const shade = random() < 0.5 ? 0.82 : 1.16;
    ctx.strokeStyle = css(colour.map((c) => Math.min(255, c * shade)), 0.35);
    path(ctx, offset(points, width * side));
    ctx.stroke();
  }
}

/** The same stroke as relief: a raised ridge with grooves where the bristles were. */
export function impasto(ctx, points, width, random) {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const height = 150 + random() * 90;

  ctx.lineWidth = width * 1.15;
  ctx.strokeStyle = 'rgba(70,70,70,0.35)';
  path(ctx, points);
  ctx.stroke();

  ctx.lineWidth = width * 0.8;
  ctx.strokeStyle = `rgba(${height},${height},${height},0.7)`;
  path(ctx, points);
  ctx.stroke();

  ctx.lineWidth = Math.max(0.6, width * 0.14);
  ctx.strokeStyle = 'rgba(40,40,40,0.4)';
  for (const side of [-0.25, 0.05, 0.3]) {
    path(ctx, offset(points, width * side));
    ctx.stroke();
  }
}

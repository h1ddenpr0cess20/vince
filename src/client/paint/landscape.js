import { lay, mix, pick, rgb, seeded, trace, vary } from './brush.js';

const TAU = Math.PI * 2;

const SKY = {
  top: rgb('#14204e'),
  high: rgb('#223d78'),
  low: rgb('#3c6394'),
  horizon: rgb('#7c9bb6'),
  glow: rgb('#c4a45e'),
};
const CLOUD = [rgb('#9cbcd8'), rgb('#c6d6e0'), rgb('#7fa2c8'), rgb('#ddd3a4')];
const FAR = [rgb('#2e3566'), rgb('#3b4380'), rgb('#283058'), rgb('#4a3f78')];
const NEAR = [rgb('#2f3f3a'), rgb('#3b4d3a'), rgb('#28343f'), rgb('#4a5a3a')];
const FIELDS = {
  wheat: [rgb('#b08d3c'), rgb('#c19d48'), rgb('#8e7330'), rgb('#d3b35c')],
  olive: [rgb('#6b7434'), rgb('#59652e'), rgb('#7d8540'), rgb('#8a7a3a')],
  meadow: [rgb('#3c5a4a'), rgb('#2f4a45'), rgb('#4a6a48'), rgb('#3a4f62')],
  ploughed: [rgb('#8a5a2e'), rgb('#6e4a2c'), rgb('#9a6a36'), rgb('#5a4a3a')],
};
const KINDS = Object.keys(FIELDS);

/** A rolling line across the width: a few sines, each half as loud as the last. */
function rolling(width, amplitude, random) {
  const waves = [1.3, 2.9, 6.1].map((f, i) => ({ f: f * (0.8 + random() * 0.4), phase: random() * TAU, a: amplitude / (i + 1) }));
  const at = (x) => waves.reduce((sum, w) => sum + Math.sin((x / width) * w.f * TAU + w.phase) * w.a, 0);
  at.slope = (x) => (at(x + 1) - at(x - 1)) / 2;
  return at;
}

/**
 * Where everything goes on a canvas this shape: the horizon, two lines of
 * hills, the clouds and eddies in the sky, and the point the furrows run to. Nothing in
 * it is anywhere in particular — it is the kind of evening he painted, not
 * one of the ones he did.
 */
export function compose(width, height, random = seeded(1890)) {
  const portrait = height > width;
  const horizon = height * (portrait ? 0.56 : 0.6);
  const unit = Math.sqrt(width * height) / 1000;

  const farWave = rolling(width, height * 0.03, random);
  const nearWave = rolling(width, height * 0.022, random);
  const far = (x) => horizon - height * 0.055 + farWave(x);
  far.slope = farWave.slope;
  const near = (x) => horizon + height * 0.012 + nearWave(x);
  near.slope = nearWave.slope;

  /** A couple of places where the wind curls back on itself — eddies, not whirlpools. */
  const vortices = Array.from({ length: portrait ? 2 : 3 }, (_, i) => ({
    x: width * ((i + 0.15 + random() * 0.7) / (portrait ? 2 : 3)),
    y: horizon * (0.2 + random() * 0.45),
    r: unit * (110 + random() * 120),
    spin: random() < 0.5 ? -1 : 1,
  }));

  /** Where the clouds are: a few broad waves crossed with each other, read as a 0..1 lightness. */
  const clouds = Array.from({ length: 4 }, () => ({
    fx: (0.8 + random() * 2.4) * TAU / width,
    fy: (0.6 + random() * 1.8) * TAU / horizon,
    px: random() * TAU,
    py: random() * TAU,
    tilt: (random() - 0.5) * 1.2,
  }));

  const vanish = { x: width * (0.3 + random() * 0.4), y: horizon - height * 0.02 };
  const cuts = Array.from({ length: 7 }, () => random()).sort();
  const bands = [0.18 + random() * 0.1, 0.45 + random() * 0.15];
  const kinds = Array.from({ length: 24 }, () => KINDS[Math.floor(random() * KINDS.length)]);

  return { width, height, horizon, unit, far, near, vortices, clouds, vanish, cuts, bands, kinds };
}

/** The sky's grain: a slow wind across, rising and falling, curling where it eddies. */
function skyFlow(scene) {
  return (x, y) => {
    let dx = 1;
    let dy = Math.sin(x / scene.width * 4 + y / scene.height * 7) * 0.3
      + Math.sin(x / scene.width * 11 - y / scene.height * 5) * 0.12;
    for (const v of scene.vortices) {
      const ox = x - v.x;
      const oy = y - v.y;
      const d = Math.hypot(ox, oy) || 1;
      const k = Math.exp(-((d / v.r) ** 2) * 1.1) * 1.6;
      dx += (-oy / d) * v.spin * k;
      dy += (ox / d) * v.spin * k;
    }
    const length = Math.hypot(dx, dy) || 1;
    return [dx / length, dy / length];
  };
}

/** How much cloud there is at a point, 0..1 — soft-edged, and thinner high up. */
export function cloudAt(scene, x, y) {
  let n = 0;
  for (const c of scene.clouds) {
    n += Math.sin(x * c.fx + y * c.tilt * c.fy + c.px) * Math.sin(y * c.fy + c.py);
  }
  n /= scene.clouds.length;
  const f = y / scene.horizon;
  return Math.max(0, Math.min(1, (n - 0.08) * 3.2)) * (0.45 + 0.55 * Math.min(1, f * 1.6));
}

function skyColour(scene, x, y, random) {
  const f = Math.max(0, Math.min(1, y / scene.horizon));
  let c = f < 0.45 ? mix(SKY.top, SKY.high, f / 0.45)
    : f < 0.85 ? mix(SKY.high, SKY.low, (f - 0.45) / 0.4)
      : mix(SKY.low, SKY.horizon, (f - 0.85) / 0.15);
  if (f > 0.88) c = mix(c, SKY.glow, ((f - 0.88) / 0.12) * 0.55);
  const cloud = cloudAt(scene, x, y);
  if (cloud > 0.05) c = mix(c, pick(CLOUD, random), cloud * 0.75);
  return vary(c, 0.08, random);
}

/** Which field a point in the foreground belongs to: a wedge from the vanishing point, and a band of depth. */
function fieldAt(scene, x, y) {
  const angle = Math.atan2(y - scene.vanish.y, x - scene.vanish.x) / Math.PI;
  let wedge = 0;
  while (wedge < scene.cuts.length && angle > scene.cuts[wedge]) wedge++;
  const depth = (y - scene.horizon) / (scene.height - scene.horizon);
  const band = depth < scene.bands[0] ? 0 : depth < scene.bands[1] ? 1 : 2;
  return { kind: scene.kinds[(wedge * 3 + band) % scene.kinds.length], depth, wedge };
}

function fieldFlow(scene) {
  return (x, y) => {
    const { kind } = fieldAt(scene, x, y);
    if (kind === 'meadow' || kind === 'olive') {
      const slope = scene.near.slope(x) * 0.3;
      const length = Math.hypot(1, slope);
      return [1 / length, slope / length];
    }
    const dx = x - scene.vanish.x;
    const dy = y - scene.vanish.y;
    const length = Math.hypot(dx, dy) || 1;
    if (kind === 'wheat') return [dx / length * 0.35, 1];
    return [dx / length, dy / length];
  };
}

function ridgeFlow(line) {
  return (x) => {
    const slope = line.slope(x);
    const length = Math.hypot(1, slope);
    return [1 / length, slope / length];
  };
}

/** The flat colour every layer goes down on first, so nothing shows through while the strokes arrive. */
function underpaint(ctx, scene) {
  const { width, height, horizon } = scene;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon);
  sky.addColorStop(0, 'rgb(20,32,78)');
  sky.addColorStop(0.5, 'rgb(34,61,120)');
  sky.addColorStop(0.9, 'rgb(70,104,146)');
  sky.addColorStop(1, 'rgb(150,150,140)');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, horizon + height * 0.05);

  const band = (line, fill, bottom) => {
    ctx.beginPath();
    ctx.moveTo(0, bottom);
    for (let x = 0; x <= width; x += 8) ctx.lineTo(x, line(x));
    ctx.lineTo(width, bottom);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  };
  band(scene.far, 'rgb(46,53,100)', horizon + height * 0.06);

  const ground = ctx.createLinearGradient(0, horizon, 0, height);
  ground.addColorStop(0, 'rgb(84,88,48)');
  ground.addColorStop(1, 'rgb(46,44,28)');
  band(scene.near, ground, height);
}

/**
 * Paints the landscape onto `ctx`, a batch of strokes at a time: it is a
 * generator, so whoever drives it decides how much of a frame to spend, and
 * running it to the end paints the whole thing at once.
 */
export function* paintLandscape(ctx, width, height, { seed = 1890, batch = 300 } = {}) {
  const random = seeded(seed);
  const scene = compose(width, height, random);
  const { unit, horizon } = scene;

  underpaint(ctx, scene);
  yield scene;

  let laid = 0;
  function* strokes(count, where, flow, colour, length, thick) {
    for (let i = 0; i < count; i++) {
      const [x, y] = where();
      const path = trace(x, y, flow, length(y), 3);
      lay(ctx, path, thick(y), colour(x, y), random);
      if (++laid % batch === 0) yield scene;
    }
  }

  const area = (h) => (width * h) / (unit * unit);
  const sky = skyFlow(scene);
  yield* strokes(
    Math.round(area(horizon) / 95),
    () => [random() * width, random() * (horizon + 4 * unit)],
    sky,
    (x, y) => skyColour(scene, x, y, random),
    () => (18 + random() * 20) * unit,
    () => (5 + random() * 4) * unit,
  );

  const farRidge = ridgeFlow(scene.far);
  yield* strokes(
    Math.round(area(height * 0.08) / 80),
    () => {
      const x = random() * width;
      const y = scene.far(x) + random() * (horizon + height * 0.05 - scene.far(x));
      return [x, y];
    },
    farRidge,
    () => vary(pick(FAR, random), 0.1, random),
    () => (14 + random() * 14) * unit,
    () => (4 + random() * 3) * unit,
  );

  const fields = fieldFlow(scene);
  const deeper = (y) => 1 + 1.6 * Math.max(0, (y - horizon) / (height - horizon));
  yield* strokes(
    Math.round(area(height - horizon) / 120),
    () => {
      const x = random() * width;
      const top = scene.near(x);
      return [x, top + random() * (height - top)];
    },
    fields,
    (x, y) => {
      const { kind, depth } = fieldAt(scene, x, y);
      const base = pick(FIELDS[kind], random);
      return vary(depth < 0.08 ? mix(base, pick(NEAR, random), 0.6) : base, 0.1, random);
    },
    (y) => (14 + random() * 16) * unit * deeper(y),
    (y) => (4.5 + random() * 3.5) * unit * deeper(y),
  );

  return scene;
}

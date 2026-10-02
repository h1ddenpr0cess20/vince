import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mountBackdrop } from '../../src/client/paint/backdrop.js';
import { css, mix, rgb, seeded, trace, vary } from '../../src/client/paint/brush.js';
import { cloudAt, compose, paintLandscape } from '../../src/client/paint/landscape.js';

/** Enough of a 2D context to paint on, keeping count and checking every coordinate. */
function fakeContext() {
  const ctx = {
    strokes: 0,
    fills: 0,
    points: 0,
    bad: 0,
    log: [],
    point(...xs) {
      ctx.points++;
      if (!xs.every(Number.isFinite)) ctx.bad++;
    },
    createLinearGradient: () => ({ addColorStop() {} }),
    fillRect() { ctx.fills++; },
    beginPath() {},
    closePath() {},
    moveTo(x, y) { ctx.point(x, y); ctx.log.push(Math.round(x * 100), Math.round(y * 100)); },
    lineTo(x, y) { ctx.point(x, y); },
    quadraticCurveTo(a, b, c, d) { ctx.point(a, b, c, d); },
    stroke() { ctx.strokes++; },
    fill() { ctx.fills++; },
  };
  return ctx;
}

describe('the brush', () => {
  describe('seeded', () => {
    it('gives the same run for the same seed, and a different one for another', () => {
      const a = seeded(1888);
      const b = seeded(1888);
      const c = seeded(1889);
      const first = Array.from({ length: 20 }, a);
      assert.deepEqual(Array.from({ length: 20 }, b), first);
      assert.notDeepEqual(Array.from({ length: 20 }, c), first);
    });

    it('stays in [0, 1)', () => {
      const random = seeded(7);
      for (let i = 0; i < 5000; i++) {
        const r = random();
        assert.ok(r >= 0 && r < 1, `${r}`);
      }
    });
  });

  describe('colour', () => {
    it('reads hex and mixes between two colours', () => {
      assert.deepEqual(rgb('#ff8000'), [255, 128, 0]);
      assert.deepEqual(mix([0, 0, 0], [200, 100, 50], 0.5), [100, 50, 25]);
    });

    it('varies a colour without leaving the range', () => {
      const random = seeded(3);
      for (let i = 0; i < 200; i++) {
        for (const c of vary([250, 5, 128], 0.5, random)) assert.ok(c >= 0 && c <= 255);
      }
      assert.equal(css([10.4, 20.6, 30], 0.5), 'rgba(10,21,30,0.5)');
    });
  });

  describe('trace', () => {
    it('runs half its length each way from where it started', () => {
      const path = trace(10, 10, () => [1, 0], 12, 3);
      assert.equal(path.length, 7);
      assert.deepEqual(path[3], [10, 10]);
      assert.equal(path[0][0], 4);
      assert.equal(path[6][0], 16);
    });

    it('treats the field as a direction, so a flipped arrow does not double the stroke back', () => {
      let flip = 1;
      const path = trace(0, 0, () => [(flip *= -1), 0], 12, 3);
      const steps = path.slice(1).map(([x], i) => Math.sign(x - path[i][0]));
      assert.ok(steps.every((s) => s === steps[0] && s !== 0), 'went back on itself');
    });
  });
});

describe('the landscape', () => {
  describe('compose', () => {
    it('puts the horizon a little below the middle, whatever the shape', () => {
      for (const [w, h] of [[1600, 900], [390, 844], [800, 800]]) {
        const scene = compose(w, h);
        assert.ok(scene.horizon > h * 0.5 && scene.horizon < h * 0.65, `${w}×${h}: ${scene.horizon}`);
      }
    });

    it('keeps the far hills above the near ones, and both near the horizon', () => {
      const scene = compose(1600, 900);
      for (let x = 0; x <= 1600; x += 40) {
        assert.ok(scene.far(x) < scene.near(x), `hills cross at ${x}`);
        assert.ok(Math.abs(scene.near(x) - scene.horizon) < 900 * 0.1);
      }
    });

    it('keeps every eddy in the sky', () => {
      const scene = compose(1600, 900);
      assert.ok(scene.vortices.length >= 2);
      for (const v of scene.vortices) assert.ok(v.y > 0 && v.y < scene.horizon);
    });

    it('has some cloud and some clear sky, and nothing outside 0..1', () => {
      const scene = compose(1600, 900);
      const samples = [];
      for (let y = 0; y < scene.horizon; y += 20) {
        for (let x = 0; x < 1600; x += 20) samples.push(cloudAt(scene, x, y));
      }
      assert.ok(samples.every((c) => c >= 0 && c <= 1));
      assert.ok(samples.some((c) => c > 0.4), 'no cloud');
      assert.ok(samples.filter((c) => c === 0).length > samples.length * 0.2, 'no clear sky');
    });
  });

  describe('paintLandscape', () => {
    it('paints a batch at a time, then the whole picture', () => {
      const ctx = fakeContext();
      const steps = paintLandscape(ctx, 640, 400, { batch: 100 });
      assert.ok(steps.next().value.horizon, 'the first step is the underpainting, and hands back the plan');
      assert.equal(ctx.strokes, 0, 'no strokes before the underpainting is down');
      let batches = 0;
      while (!steps.next().done) batches++;
      assert.ok(batches > 10, `only ${batches} batches`);
      assert.ok(ctx.strokes > 3000, `only ${ctx.strokes} strokes`);
      assert.equal(ctx.bad, 0, 'a stroke went somewhere that is not a number');
    });

    it('paints the same picture every time for the same shape', () => {
      const run = () => {
        const ctx = fakeContext();
        for (const _ of paintLandscape(ctx, 320, 200)) void _;
        return ctx.log;
      };
      assert.deepEqual(run(), run());
    });
  });
});

describe('mountBackdrop', () => {
  it('goes quiet on something that is not a canvas', () => {
    assert.equal(mountBackdrop(null), null);
    assert.equal(mountBackdrop({}), null);
    assert.equal(mountBackdrop({ getContext: () => null }), null);
  });
});

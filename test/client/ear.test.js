import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as GFX from '../../src/client/vendor/gfx/index.js';

import { createEarBuddy } from '../../src/client/ear/index.js';
import { ENERGY_GAIN, MOODS } from '../../src/client/ear/moods.js';
import { approach, spring } from '../../src/client/ear/motion.js';
import {
  CENTRE, MIN_THICKNESS, backing, buildPinna, createPinna, locate, outlineAt, reliefAt,
} from '../../src/client/ear/pinna.js';
import { createImpasto } from '../../src/client/ear/skin.js';

describe('MOODS', () => {
  const CHANNELS = [
    'jitter', 'lean', 'attend', 'sway', 'swaySpeed', 'cock', 'swirl', 'hop', 'perk', 'flutter', 'squash', 'fidget',
  ];

  it('covers the four conversational states', () => {
    assert.deepEqual(Object.keys(MOODS).sort(), ['idle', 'listening', 'speaking', 'thinking']);
  });

  it('gives every state every channel', () => {
    for (const [name, mood] of Object.entries(MOODS)) {
      assert.deepEqual(Object.keys(mood).sort(), [...CHANNELS].sort(), `${name} is missing a channel`);
      for (const [channel, value] of Object.entries(mood)) {
        assert.equal(typeof value, 'number', `${name}.${channel}`);
        assert.ok(Number.isFinite(value), `${name}.${channel} is not finite`);
      }
    }
  });

  it('names only channels that exist when energy pushes them', () => {
    for (const channel of Object.keys(ENERGY_GAIN)) {
      assert.ok(channel in MOODS.idle, `ENERGY_GAIN.${channel} has no matching mood channel`);
    }
  });

  it('swirls for thinking and nothing else, which is the pose that reads', () => {
    assert.ok(MOODS.thinking.swirl > 0);
    for (const name of ['idle', 'listening', 'speaking']) {
      assert.equal(MOODS[name].swirl, 0, `${name} would swirl`);
      assert.ok(MOODS[name].cock < MOODS.thinking.cock, `${name} cocks as far as thinking does`);
    }
  });

  it('turns all the way to whoever is talking while listening, and away while thinking', () => {
    assert.equal(MOODS.listening.attend, 1);
    for (const name of ['idle', 'thinking', 'speaking']) {
      assert.ok(MOODS[name].attend < MOODS.listening.attend, `${name} attends as hard as listening`);
    }
    assert.equal(MOODS.thinking.attend, 0);
  });

  it('flutters to a voice while listening more than while talking', () => {
    assert.ok(MOODS.listening.flutter > MOODS.speaking.flutter);
    assert.equal(MOODS.idle.flutter, 0);
    assert.equal(MOODS.thinking.flutter, 0);
  });

  it('hops only while talking, and keeps listening calmer than speaking', () => {
    assert.ok(MOODS.speaking.hop > 0);
    for (const name of ['idle', 'listening', 'thinking']) assert.equal(MOODS[name].hop, 0, `${name} would hop`);
    assert.ok(MOODS.listening.jitter < MOODS.speaking.jitter);
    assert.ok(MOODS.listening.squash < MOODS.speaking.squash);
  });

  it('leaves the states that should hold still with nothing for energy to scale', () => {
    assert.equal(MOODS.thinking.squash, 0);
    assert.equal(MOODS.idle.squash, 0);
  });
});

describe('motion', () => {
  describe('spring', () => {
    it('settles on its target from either side', () => {
      for (const from of [-2, 0, 5]) {
        const s = { p: from, v: 0 };
        for (let i = 0; i < 2000; i++) spring(s, 175, 10.5, 1 / 60, 1);
        assert.ok(Math.abs(s.p - 1) < 1e-6, `from ${from} settled at ${s.p}`);
        assert.ok(Math.abs(s.v) < 1e-6);
      }
    });

    it('overshoots before it settles — that is the whole point of a spring', () => {
      const s = { p: 0, v: 0 };
      let peak = 0;
      for (let i = 0; i < 240; i++) peak = Math.max(peak, spring(s, 175, 6, 1 / 60, 1));
      assert.ok(peak > 1, `never overshot, peaked at ${peak}`);
    });

    it('stays finite at the longest frame the loop will hand it', () => {
      const s = { p: 0, v: 0 };
      for (let i = 0; i < 500; i++) spring(s, 175, 10.5, 0.05, 1);
      assert.ok(Number.isFinite(s.p) && Number.isFinite(s.v));
      assert.ok(Math.abs(s.p - 1) < 1e-3);
    });

    it('returns the position it just wrote, so a caller can read it inline', () => {
      const s = { p: 0, v: 0 };
      assert.equal(spring(s, 68, 6.2, 1 / 60, 1), s.p);
    });
  });

  describe('approach', () => {
    it('closes a fixed fraction of the gap per second', () => {
      assert.equal(approach(0, 1, 2, 0.25), 0.5);
    });

    it('lands exactly on target rather than overshooting on a long frame', () => {
      assert.equal(approach(0, 1, 10, 1), 1);
      assert.equal(approach(5, -3, 40, 0.5), -3);
    });

    it('is a no-op when it is already there', () => {
      assert.equal(approach(0.4, 0.4, 3.2, 1 / 60), 0.4);
    });
  });
});

describe('the outline', () => {
  const ring = Array.from({ length: 400 }, (_, i) => outlineAt(i / 400));
  const span = (axis) => Math.max(...ring.map((p) => p[axis])) - Math.min(...ring.map((p) => p[axis]));

  it('is taller than it is wide', () => {
    assert.ok(span(1) > span(0) * 1.4, `${span(1)} tall against ${span(0)} wide`);
  });

  it('is fuller over the top than at the lobe, which is what makes it an ear and not an egg', () => {
    const width = (lo, hi) => {
      const xs = ring.filter(([, y]) => y > lo && y < hi).map(([x]) => x);
      return Math.max(...xs) - Math.min(...xs);
    };
    assert.ok(width(0.2, 0.5) > width(-0.6, -0.45) * 1.5);
  });

  it('winds counter-clockwise seen from the front, so the faces face out', () => {
    let area = 0;
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i];
      const [x1, y1] = ring[(i + 1) % ring.length];
      area += x0 * y1 - x1 * y0;
    }
    assert.ok(area > 0);
  });

  it('closes on itself', () => {
    const [a, b] = [outlineAt(0), outlineAt(1)];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9);
  });
});

describe('the relief', () => {
  it('sinks into the canal deeper than anywhere in the bowl around it', () => {
    assert.ok(reliefAt(-0.19, -0.07) < reliefAt(-0.04, -0.02));
    assert.ok(reliefAt(-0.04, -0.02) < 0, 'the concha is not a hollow');
  });

  it('raises the helix and the antihelix with the scapha a groove between them', () => {
    const helix = reliefAt(0.40, 0.25);
    const scapha = reliefAt(0.31, 0.32);
    const antihelix = reliefAt(0.21, 0.08);
    assert.ok(helix > scapha && antihelix > scapha, `${helix} / ${scapha} / ${antihelix}`);
  });

  it('puts the tragus up in front of the canal', () => {
    assert.ok(reliefAt(-0.29, -0.09) > reliefAt(-0.19, -0.07) + 0.2);
  });

  it('keeps the lobe soft — no folds in it', () => {
    const samples = [[-0.1, -0.55], [0, -0.6], [0.08, -0.5], [-0.05, -0.66]].map(([x, y]) => reliefAt(x, y));
    assert.ok(Math.max(...samples) - Math.min(...samples) < 0.04);
  });

  it('never lets the back come through the front', () => {
    for (let y = -0.7; y <= 0.7; y += 0.02) {
      for (let x = -0.35; x <= 0.42; x += 0.02) {
        const { s } = locate(x, y);
        if (s > 1) continue;
        const front = reliefAt(x, y);
        assert.ok(front - backing(x, y, s, front) >= MIN_THICKNESS * 0.75, `too thin at ${x.toFixed(2)}, ${y.toFixed(2)}`);
      }
    }
  });

  it('rounds the back behind the canal instead of pulling it to a point', () => {
    for (let y = -0.7; y <= 0.7; y += 0.02) {
      for (let x = -0.35; x <= 0.42; x += 0.02) {
        const { s } = locate(x, y);
        if (s > 1) continue;
        const front = reliefAt(x, y);
        const pulled = backing(x, y, s, Infinity) - backing(x, y, s, front);
        assert.ok(pulled < 0.005, `the back is dragged ${pulled.toFixed(3)} after the front at ${x.toFixed(2)}, ${y.toFixed(2)}`);
      }
    }
  });

  it('measures the centre as the middle and the rim as the edge', () => {
    assert.equal(locate(...CENTRE).s, 0);
    const [x, y] = outlineAt(0.3);
    assert.ok(Math.abs(locate(x, y).s - 1) < 0.01);
  });
});

describe('buildPinna', () => {
  const { positions, uvs, indices } = buildPinna({ columns: 64, front: 20, roll: 8, back: 10 });

  it('is all finite', () => {
    assert.ok(positions.every(Number.isFinite));
    assert.ok(uvs.every(Number.isFinite));
  });

  it('lands the whole ear inside the painted canvas', () => {
    for (const v of uvs) assert.ok(v > 0 && v < 1, `uv ${v} is off the canvas`);
  });

  it('only indexes vertices that exist, as whole triangles', () => {
    const count = positions.length / 3;
    assert.equal(indices.length % 3, 0);
    for (const i of indices) assert.ok(i >= 0 && i < count);
  });

  it('is deterministic — no randomness to make Vince differ per load', () => {
    const again = buildPinna({ columns: 64, front: 20, roll: 8, back: 10 });
    assert.deepEqual(again.positions, positions);
  });

  it('faces out: forward at the front of the bowl, back behind it', () => {
    const { geometry } = createPinna(GFX, { map: null, bumpMap: null }, { columns: 64, front: 20, roll: 8, back: 10 });
    const normals = geometry.attributes.normal.array;
    assert.ok(normals[2] > 0.9, `front normal ${normals[2]}`);
    assert.ok(normals[normals.length - 1] < -0.9, `back normal ${normals[normals.length - 1]}`);
  });

  it('stands him on the bottom of his lobe', () => {
    const { foot, geometry } = createPinna(GFX, { map: null, bumpMap: null }, { columns: 64, front: 20, roll: 8, back: 10 });
    assert.equal(foot, geometry.boundingBox.min.y);
    assert.ok(foot < -0.7);
  });
});

describe('createImpasto', () => {
  it('goes inert without a document instead of throwing', () => {
    const skin = createImpasto(GFX);
    assert.equal(skin.map, null);
    assert.equal(skin.bumpMap, null);
  });
});

describe('createEarBuddy', () => {
  const stubStage = () => ({ _scene: {}, _renderer: null, setObject() {} });

  it('ignores a state that is not one of the four', () => {
    const vince = createEarBuddy({ stage: stubStage(), GFX });
    vince.setState('speaking');

    for (const junk of ['nonsense', 'constructor', '__proto__', 'toString']) {
      vince.setState(junk);
      assert.equal(vince.state, 'speaking', `${junk} was taken for a mood`);
    }
  });

  it('clamps what it is handed, so a bad level cannot escape the range', () => {
    const vince = createEarBuddy({ stage: stubStage(), GFX });
    assert.doesNotThrow(() => {
      vince.setLevel(4);
      vince.setLevel(-1);
      vince.pulse(9);
      vince.pulse(-3);
    });
  });

  it('hands the stage a named object, since the exporter writes those names out', () => {
    let object = null;
    createEarBuddy({ stage: { _scene: {}, _renderer: null, setObject: (o) => { object = o; } }, GFX });
    assert.equal(object.name, 'vince');
    assert.ok(object.getObjectByName('pinna'), 'no pinna under the group');
    assert.ok(object.getObjectByName('turner').getObjectByName('body'));
  });

  it('keeps every pose finite through a long run of frames in every state', () => {
    let object = null;
    const stage = {
      _scene: {}, _renderer: null,
      _camera: { position: { x: 2, y: 1, z: -3 } },
      setObject: (o) => { object = o; },
    };
    const vince = createEarBuddy({ stage, GFX });
    const pinna = object.getObjectByName('pinna');
    for (const state of ['listening', 'speaking', 'thinking', 'idle', 'speaking']) {
      vince.setState(state);
      for (let i = 0; i < 240; i++) {
        vince.setLevel((i % 9) / 8);
        if (i % 17 === 0) vince.pulse(0.4);
        pinna.onBeforeRender();
      }
    }
    for (const node of [object, object.getObjectByName('turner'), object.getObjectByName('body')]) {
      for (const v of [...node.position.toArray(), ...node.scale.toArray(), node.rotation.x, node.rotation.y, node.rotation.z]) {
        assert.ok(Number.isFinite(v), `${node.name} went non-finite`);
      }
    }
  });
});

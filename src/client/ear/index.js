import { buildEnvironment } from './environment.js';
import { ENERGY_GAIN, MOODS } from './moods.js';
import { approach, spring } from './motion.js';
import { createPinna } from './pinna.js';
import { createImpasto } from './skin.js';

const HOP_REACH = 0.32;
const HOP_TIME = 0.3;
const SWIRL_RADIUS = 0.09;
const TAU = Math.PI * 2;

/** The short way round from one angle to another. */
function turnTo(from, to) {
  return ((((to - from) % TAU) + TAU + Math.PI) % TAU) - Math.PI;
}

export function createEarBuddy({ stage, GFX }) {
  buildEnvironment({ stage, GFX });

  const skin = createImpasto(GFX);
  const pinna = createPinna(GFX, skin);

  const vince = new GFX.Group();
  vince.name = 'vince';
  const turner = new GFX.Group();
  turner.name = 'turner';
  const body = new GFX.Group();
  body.name = 'body';

  vince.add(turner);
  turner.add(body);
  body.add(pinna.mesh);

  /** He stands on his lobe, so that is what he leans, squashes and hops from. */
  body.position.y = pinna.foot;
  pinna.mesh.position.y = -pinna.foot;

  let mood = MOODS.idle;
  let state = 'idle';
  const m = { ...MOODS.idle };

  let sustain = 0;
  let impulse = 0;
  let energy = 0;

  const sq = { p: 0, v: 0 };
  const pk = { p: 0, v: 0 };
  const tx = { p: 0, v: 0 };
  const ty = { p: 0, v: 0 };
  const tz = { p: 0, v: 0 };
  const up = { p: 0, v: 0 };

  let t = 0;
  let yaw = 0;
  let swirlA = 0;
  let x = 0;
  let airborne = false;
  let hopT = 0;
  let hopFrom = 0;
  let hopTo = 0;
  let hopHeight = 0;
  let rest = 0.2;
  let fidgetT = 2.4;

  const timer = new GFX.Timer();

  pinna.mesh.onBeforeRender = () => {
    timer.update();
    const dt = Math.max(0, Math.min(timer.getDelta(), 0.05));
    t += dt;

    impulse = Math.max(0, impulse - impulse * Math.min(1, dt * 3.4) - dt * 0.05);
    energy = approach(energy, Math.min(1, sustain + impulse), 6, dt);

    for (const k in m) m[k] = approach(m[k], mood[k], 3.4, dt);

    const jitter = m.jitter * (1 + energy * ENERGY_GAIN.jitter);
    const squash = m.squash * (1 + energy * ENERGY_GAIN.squash);
    const swayAmp = m.sway + energy * ENERGY_GAIN.sway;

    /** Whoever is looking from the camera is who he turns his good side to. */
    const eye = stage._camera?.position;
    const facing = eye ? Math.atan2(eye.x - vince.position.x, eye.z - vince.position.z) : 0;
    yaw += turnTo(yaw, facing * m.attend) * Math.min(1, dt * 2.6);

    /** Mulling it over: cocked to one side, and the cock wandering round in a slow swirl. */
    if (m.swirl > 0.05) {
      swirlA += dt * 1.7 * m.swirl;
    } else {
      swirlA = approach(swirlA, Math.round(swirlA / TAU) * TAU, 1.6, dt);
    }
    const swirlX = Math.cos(swirlA) * SWIRL_RADIUS * m.swirl;
    const swirlZ = Math.sin(swirlA) * SWIRL_RADIUS * m.swirl;

    let lift = 0;
    let stretch = 0;
    if (airborne) {
      hopT = Math.min(1, hopT + dt / HOP_TIME);
      const arc = Math.sin(Math.PI * hopT);
      lift = arc * hopHeight;
      stretch = arc * 0.5;
      x = hopFrom + (hopTo - hopFrom) * hopT;
      if (hopT >= 1) {
        airborne = false;
        sq.v += 1.5 + energy * 1.6;
        rest = 0.1 + Math.random() * 0.4 / Math.max(0.3, m.hop);
      }
    } else if (m.hop > 0.05) {
      rest -= dt;
      if (rest <= 0) {
        airborne = true;
        hopT = 0;
        hopFrom = x;
        const drift = (Math.random() - 0.5) * 0.24 - x * 0.35;
        hopTo = Math.max(-HOP_REACH, Math.min(HOP_REACH, x + drift));
        hopHeight = (0.04 + energy * 0.07 + Math.random() * 0.025) * m.hop;
      }
    } else {
      x = approach(x, 0, 1.8, dt);
    }

    if (m.fidget > 0.01) {
      fidgetT -= dt * m.fidget;
      if (fidgetT <= 0) {
        const r = Math.random();
        if (r < 0.4) ty.v += (Math.random() < 0.5 ? -1 : 1) * 3.2;
        else if (r < 0.7) up.v += 1.1;
        else pk.v += 1.6;
        fidgetT = 2.6 + Math.random() * 4;
      }
    }

    spring(sq, 175, 10.5, dt, squash);
    spring(pk, 90, 7.5, dt, m.perk);
    spring(up, 120, 9, dt, 0);
    const sway = Math.sin(t * m.swaySpeed * 2.0) * swayAmp;
    spring(tz, 68, 6.2, dt, sway);
    spring(tx, 68, 6.2, dt, m.lean * 0.6);
    spring(ty, 60, 5.4, dt, 0);

    const tremor = jitter * 0.014;
    const breathe = Math.sin(t * 1.3) * 0.006;
    const flutter = m.flutter * energy;
    const buzz = Math.sin(t * 41) * flutter * 0.03;

    vince.position.set(
      x + swirlX + (Math.random() - 0.5) * tremor,
      lift + Math.max(0, up.p) * 0.35,
      swirlZ + (Math.random() - 0.5) * tremor,
    );
    vince.rotation.set(
      (Math.random() - 0.5) * tremor,
      0,
      (Math.random() - 0.5) * tremor * 1.3,
    );

    turner.rotation.y = yaw + ty.p * 0.25;
    body.rotation.set(
      tx.p + Math.sin(swirlA) * m.cock,
      0,
      tz.p + Math.cos(swirlA) * m.cock + buzz,
    );

    const s = sq.p * 0.085 + breathe - stretch * 0.06;
    const tall = 1 + pk.p;
    body.scale.set(1 + s * 0.5 + flutter * 0.01, (1 - s) * tall, 1 + s * 0.5);
  };

  stage.setObject(vince);

  return {
    get state() { return state; },

    setState(next) {
      if (!Object.hasOwn(MOODS, next) || next === state) return;
      state = next;
      mood = MOODS[next];
      if (next === 'idle' || next === 'thinking') sustain = 0;
    },

    setLevel(level) {
      sustain = Math.min(1, Math.max(0, level));
    },

    pulse(weight = 0.3) {
      const w = Math.min(1, Math.max(0, weight));
      impulse = Math.min(1, impulse + w);
      sq.v += w * 2.4;
      tz.v += (Math.random() - 0.5) * w * 2.6;
    },
  };
}

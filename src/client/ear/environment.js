/**
 * What the varnish reflects: the evening behind him — a warm lamp high up,
 * blue below it, dark ground — so the paint picks up the same light the
 * landscape is painted in.
 */
export function buildEnvironment({ stage, GFX }) {
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 32;
    const ctx = c.getContext('2d');
    const g = ctx.createLinearGradient(0, 0, 0, 32);
    g.addColorStop(0, '#fbe9bf'); g.addColorStop(0.32, '#8ea3cc');
    g.addColorStop(0.52, '#3b4a7a'); g.addColorStop(0.58, '#2a2b30');
    g.addColorStop(1, '#101117');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 32);
    ctx.fillStyle = 'rgba(255,236,186,0.95)'; ctx.beginPath();
    ctx.ellipse(22, 6, 11, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    const tex = new GFX.Texture(c);
    tex.mapping = GFX.EquirectangularReflectionMapping;
    tex.colorSpace = GFX.SRGBColorSpace;
    tex.needsUpdate = true;
    const pmrem = new GFX.PMREMGenerator(stage._renderer);
    stage._scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose(); tex.dispose();
  } catch {
  }
}

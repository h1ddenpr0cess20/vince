import { paintLandscape } from './landscape.js';

/** How much of a frame the painting may take while it is still going on. */
const BUDGET_MS = 9;

/**
 * The landscape behind Vince, on its own canvas under the stage. It paints
 * itself in a few milliseconds a frame so the page never stalls on it, and
 * paints again only when the window changes shape enough to want a different
 * composition — a keyboard coming up is not that, so it is sized to the large
 * viewport and simply covered.
 */
export function mountBackdrop(canvas, { budget = BUDGET_MS } = {}) {
  const ctx = canvas?.getContext?.('2d');
  if (!ctx) return null;

  let job = 0;
  let shape = { width: 0, height: 0 };

  const still = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  function paint() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    shape = { width, height };
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const strokes = paintLandscape(ctx, canvas.width, canvas.height);
    const mine = ++job;
    if (still()) {
      while (!strokes.next().done) {
        // all at once: no painting itself in for anyone who asked for less motion
      }
      return;
    }
    const run = () => {
      if (mine !== job) return;
      const until = performance.now() + budget;
      while (performance.now() < until) {
        if (strokes.next().done) return;
      }
      requestAnimationFrame(run);
    };
    run();
  }

  function reshaped() {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    if ((width > height) !== (shape.width > shape.height)) return true;
    return Math.abs(width - shape.width) / (shape.width || 1) > 0.2
      || Math.abs(height - shape.height) / (shape.height || 1) > 0.25;
  }

  let wait = 0;
  const onResize = () => {
    clearTimeout(wait);
    wait = setTimeout(() => {
      if (reshaped()) paint();
    }, 250);
  };
  window.addEventListener('resize', onResize);

  paint();

  return {
    repaint: paint,
    close() {
      job++;
      clearTimeout(wait);
      window.removeEventListener('resize', onResize);
    },
  };
}

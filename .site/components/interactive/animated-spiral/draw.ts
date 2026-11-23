// animated-spiral: the reference's content/articles/animated-spiral/components/animated-spiral/spiral.tsx.
// 1,500 dots on a logarithmic spiral (x = i/4 · e^(0.005·θ) · cos(θ·i)) around the canvas's centre on #0a0a0a; Play
// moves them to a random angle, Reset to π/2, over 1.5 s (easeInOutQuad) or at once (`animated` false), from where the
// last move aimed. Radius 1, or 1 → 0.1 with the distance from the centre; white, or the cyan-magenta-yellow sweep
// with its blurred halo (Skia's BlurMask style "solid", 5 px). `spiral(key, fixedRadius, sweep, animated, visible,
// presses, kind)`.
import { SWEEP, easeInOutQuad, halo, HALO_OFFSET, interpolate, memo, sample, seeded, sweepGradient, turn, type Ctx2D, type Frame } from '../_canvas/util';

const COUNT = 1500;
const DURATION = 1500;
const HALO_BUCKETS = 48;

function coordinates(angle: number) {
  const out = new Float64Array(COUNT * 2), e = Math.exp(0.005 * angle);
  for (let i = 0; i < COUNT; i++) {
    const a = (i / 4) * e;
    out[i * 2] = a * Math.cos(angle * i);
    out[i * 2 + 1] = a * Math.sin(angle * i);
  }
  return out;
}

type State = { from: Float64Array; to: Float64Array; start: number; presses: number; now: Float64Array; r: Float64Array };
const state = memo<State>();

export function drawSpiral(ctx: Ctx2D, f: Frame, [key, fixedRadius, sweep, animated, visible, presses, kind]: [string, boolean, boolean, boolean, boolean, number, string]): boolean {
  const s = state(key, f, () => {
    const to = coordinates(Math.PI / 2);
    return { from: to, to, start: -Infinity, presses, now: new Float64Array(COUNT * 2), r: new Float64Array(COUNT) };
  });
  if (presses !== s.presses) {
    s.presses = presses;
    s.from = s.to;
    s.to = coordinates(kind === 'reset' ? Math.PI / 2 : Math.PI * 2 * seeded(f.time, presses)());
    s.start = f.time;
  }
  const t = animated ? Math.min((f.time - s.start) / DURATION, 1) : 1;
  const p = easeInOutQuad(t);
  const { width, height } = f, cx = width / 2, cy = height / 2;
  const maxDistance = Math.sqrt(cx * cx + cy * cy);

  ctx.fillStyle = '#0a0a0a';
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < COUNT; i++) {
    const x = s.from[i * 2] + (s.to[i * 2] - s.from[i * 2]) * p, y = s.from[i * 2 + 1] + (s.to[i * 2 + 1] - s.from[i * 2 + 1]) * p;
    s.now[i * 2] = x; s.now[i * 2 + 1] = y;
    s.r[i] = fixedRadius ? 1 : interpolate(Math.sqrt(x * x + y * y), [0, maxDistance], [1, 0.1]);
  }
  const dots = (pick: (i: number) => boolean, dx: number) => {
    ctx.beginPath();
    for (let i = 0; i < COUNT; i++) {
      if (!pick(i)) continue;
      const x = cx + s.now[i * 2] + dx, y = cy + s.now[i * 2 + 1], r = s.r[i];
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  if (sweep) {
    // The halo: each dot's colour is the sweep's at its angle, so the dots go to pieces by angle.
    const bucket = new Int32Array(COUNT);
    for (let i = 0; i < COUNT; i++) bucket[i] = Math.min(HALO_BUCKETS - 1, Math.floor(turn(s.now[i * 2], s.now[i * 2 + 1]) * HALO_BUCKETS));
    halo(ctx, f, 5, HALO_BUCKETS, (t) => sample(SWEEP, t), (from) => {
      const b = Math.round(from * HALO_BUCKETS);
      dots((i) => bucket[i] === b, -HALO_OFFSET);
    }, false);
    ctx.fillStyle = sweepGradient(ctx, cx, cy);
  } else ctx.fillStyle = 'white';
  dots(() => true, 0);
  return visible && t < 1;
}

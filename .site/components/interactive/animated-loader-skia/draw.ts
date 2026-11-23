// animated-loader-skia: the reference's content/articles/animated-loader-skia/components/loader/component.tsx.
// A 15 px round-capped arc of radius 56.5 in a 158 px canvas, from `start` turns to a full turn (3 o'clock, clockwise):
// #6370CA, or the cyan-magenta-yellow sweep over its blurred halo (Skia's BlurMask style "solid", 5 px). Play spins it
// (one turn a second, linear, from 0, forever; the reference rotates the canvas's box, drawn here as the same rotation
// about the centre) and, for "with-animation", breathes the start 0.6 → 0.3 → 0.6 each turn; Reset puts it at 0.
// `loader(key, type, start, visible, presses, kind)`.
import { SWEEP, halo, HALO_OFFSET, interpolate, memo, sample, sweepGradient, type Ctx2D, type Frame } from '../_canvas/util';

const SIZE = 128, STROKE = 15, RADIUS = (SIZE - STROKE) / 2;
const TAU = Math.PI * 2;
const HALO_STEP = 2; // degrees per halo piece

type State = { start: number; spinning: boolean; presses: number };
const state = memo<State>();

export function drawLoader(ctx: Ctx2D, f: Frame, [key, type, startArg, visible, presses, kind]: [string, string, number, boolean, number, string]): boolean {
  const spins = type === 'with-animation' || type === 'with-basic-animation';
  const s = state(key, f, () => ({ start: 0, spinning: false, presses }));
  if (presses !== s.presses) {
    s.presses = presses;
    s.spinning = spins && kind === 'play';
    s.start = f.time;
  }
  const value = s.spinning ? ((f.time - s.start) / 1000) % 1 : 0;
  const start = type === 'basic' ? 0 : type === 'with-animation' ? interpolate(value, [0, 0.5, 1], [0.6, 0.3, 0.6]) : type === 'with-progress' ? startArg : 0.6;
  const rotation = spins ? TAU * value : 0;
  const cx = f.width / 2, cy = f.height / 2;
  const a0 = start * TAU + rotation, a1 = TAU + rotation;

  ctx.clearRect(0, 0, f.width, f.height);
  ctx.lineWidth = STROKE;
  ctx.lineCap = 'round';
  if (type === 'basic' || type === 'with-progress') ctx.strokeStyle = '#6370CA';
  else {
    // The halo: the arc in 2° pieces (butt ends, the round caps as discs), each in the sweep's colour where it lies.
    const span = a1 - a0, n = Math.max(1, Math.ceil(((span / TAU) * 360) / HALO_STEP));
    const colorAt = (a: number) => sample(SWEEP, ((((a - rotation) / TAU) % 1) + 1) % 1);
    ctx.save();
    ctx.lineCap = 'butt';
    halo(ctx, f, 5, n + 2, (t) => {
      const i = Math.round(t * (n + 2) - 0.5);
      return colorAt(i === 0 ? a0 : i === n + 1 ? a1 : a0 + (span * (i - 0.5)) / n);
    }, (from) => {
      const i = Math.round(from * (n + 2));
      ctx.beginPath();
      if (i === 0 || i === n + 1) {
        const a = i === 0 ? a0 : a1;
        // A cap: the half disc beyond the arc's end.
        const ex = cx - HALO_OFFSET + RADIUS * Math.cos(a), ey = cy + RADIUS * Math.sin(a);
        ctx.arc(ex, ey, STROKE / 2, i === 0 ? a + Math.PI : a, i === 0 ? a + 2 * Math.PI : a + Math.PI);
        ctx.fill();
      } else {
        ctx.arc(cx - HALO_OFFSET, cy, RADIUS, a0 + (span * (i - 1)) / n, a0 + (span * i) / n);
        ctx.stroke();
      }
    });
    ctx.restore();
    // The sweep turns with the canvas.
    ctx.strokeStyle = sweepGradient(ctx, cx, cy, SWEEP, rotation);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, RADIUS, a0, a1);
  ctx.stroke();
  return visible && s.spinning;
}

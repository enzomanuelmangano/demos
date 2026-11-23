// metaball: the reference's content/articles/metaball/components/metaball/component.tsx, the canvas half (the blur
// and the colour matrix are CSS on the canvas's box, as the reference's are). Two discs of radius 80 filled with the
// cyan-magenta-cyan sweep around the canvas's centre: one fixed there, one the reader drags; let go, it springs back
// to the centre (Reanimated's withSpring defaults: stiffness 100, damping 10, mass 1, the reference's integrator).
// `metaball(key, dragging, dx, dy)`: while `dragging`, the moving disc is where it was when the drag began plus
// (dx, dy).
import { CYAN, MAGENTA, memo, sweepGradient, type Ctx2D, type Frame, type Rgb } from '../_canvas/util';

const RADIUS = 80;
const STOPS: [number, Rgb][] = [[0, CYAN], [0.5, MAGENTA], [1, CYAN]];

type Axis = { x: number; v: number };
type State = { dragging: boolean; ox: number; oy: number; x: Axis; y: Axis; last: number; w: number; h: number };
const state = memo<State>();

/** One axis of the reference's `spring`: a step of at most 1/30 s; at rest within 0.01. */
function spring(a: Axis, to: number, dt: number): boolean {
  const acceleration = -100 * (a.x - to) - 10 * a.v;
  a.v += acceleration * dt;
  a.x += a.v * dt;
  if (Math.abs(a.x - to) < 0.01 && Math.abs(a.v) < 0.01) { a.x = to; a.v = 0; return false; }
  return true;
}

export function drawMetaball(ctx: Ctx2D, f: Frame, [key, dragging, dx, dy]: [string, boolean, number, number]): boolean {
  const { width, height } = f, cx = width / 2, cy = height / 2;
  const s = state(key, f, () => ({ dragging: false, ox: cx, oy: cy, x: { x: cx, v: 0 }, y: { x: cy, v: 0 }, last: f.time, w: width, h: height }));
  // A new size puts the disc back in the centre (the reference's resize).
  if (s.w !== width || s.h !== height) { s.w = width; s.h = height; s.x = { x: cx, v: 0 }; s.y = { x: cy, v: 0 }; }
  if (dragging && !s.dragging) { s.ox = s.x.x; s.oy = s.y.x; }
  if (dragging !== s.dragging) { s.dragging = dragging; s.x.v = 0; s.y.v = 0; s.last = f.time; }
  let moving = false;
  if (dragging) { s.x.x = s.ox + dx; s.y.x = s.oy + dy; }
  else {
    const dt = Math.min(Math.max(f.time - s.last, 0) / 1000, 1 / 30);
    // The reference steps both springs each frame, each to rest on its own.
    const mx = spring(s.x, cx, dt), my = spring(s.y, cy, dt);
    moving = mx || my;
  }
  s.last = f.time;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = sweepGradient(ctx, cx, cy, STOPS);
  ctx.beginPath();
  ctx.arc(s.x.x, s.y.x, RADIUS, 0, Math.PI * 2);
  ctx.arc(cx, cy, RADIUS, 0, Math.PI * 2);
  ctx.fill();
  return moving;
}

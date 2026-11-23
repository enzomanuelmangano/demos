// The /demos hero's two Canvas 2D surfaces, ported line for line from the reference:
// - `spiral(seed, taps)`: components/animated-spiral/spiral.tsx, 2,500 dots on a logarithmic spiral that ease
//   (in-out cubic, 2.5 s) to a new random angle 500 ms after mount and on each tap of the title;
// - `stars(hovered, seed)`: components/landing/hero/github-stars-button.tsx's FloatingStars, the soft 4-point stars
//   that rise out of the "Demos is Open Source" pill (one every 0.6 s, a fountain of ~50 a second while hovered).
// Data modules may not read the clock or Math.random (Exact: time and seeds are source arguments), so time is the
// frame's and the randomness a seeded stream from exactTime()'s per-launch seed.
import type { Ctx2D, Frame } from '../app.contract.d.ts';

/** mulberry32: a small, good 32-bit stream. */
function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- spiral
const COUNT = 2500;
const DURATION = 2500;
const COLOR = '#efefef';
const spiralAt = (angle: number, i: number, out: Float64Array, o: number) => {
  const a = (i / 4) * Math.exp(0.005 * angle);
  out[o] = a * Math.cos(angle * i);
  out[o + 1] = a * Math.sin(angle * i);
};
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

type Spiral = { rand: () => number; from: Float64Array; to: Float64Array; now: Float64Array; start: number; taps: number; first: number };
let spiral: Spiral | null = null;

function retarget(s: Spiral, time: number) {
  const angle = (s.rand() * Math.PI) / 2;
  s.from.set(s.now);
  for (let i = 0; i < COUNT; i++) spiralAt(angle, i, s.to, i * 2);
  s.start = time;
}

function drawSpiral(ctx: Ctx2D, f: Frame, [seed, taps]: number[]): boolean {
  if (!spiral || f.cause === 'mount') {
    const rand = stream(seed * 2654435761 + 1);
    const now = new Float64Array(COUNT * 2), angle = (rand() * Math.PI) / 2;
    for (let i = 0; i < COUNT; i++) spiralAt(angle, i, now, i * 2);
    spiral = { rand, from: now.slice(), to: now.slice(), now, start: f.time, taps, first: f.time + 500 };
  }
  const s = spiral;
  if (s.first && f.time >= s.first) { s.first = 0; retarget(s, f.time); }
  if (taps !== s.taps) { s.taps = taps; retarget(s, f.time); }
  const p = Math.min((f.time - s.start) / DURATION, 1), e = easeInOutCubic(p);
  for (let i = 0; i < COUNT * 2; i++) s.now[i] = s.from[i] + (s.to[i] - s.from[i]) * e;

  const { width, height } = f, hw = width / 2, hh = height / 2;
  const maxDistance = Math.sqrt(hw * hw + hh * hh) * 0.8;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = COLOR;
  ctx.beginPath();
  for (let i = 0; i < COUNT; i++) {
    const x = s.now[i * 2], y = s.now[i * 2 + 1];
    if (y < 0) continue;
    const radius = 0.7 * (1 - Math.min(Math.sqrt(x * x + y * y) / maxDistance, 1));
    if (radius > 0) { ctx.moveTo(hw + x + radius, y); ctx.arc(hw + x, y, radius, 0, Math.PI * 2); }
  }
  ctx.fill();
  return p < 1 || s.first !== 0;
}

// ---------------------------------------------------------------- stars
type Particle = { x: number; y: number; size: number; speed: number; vx: number; opacity: number; rotation: number; rotationSpeed: number };
const STAR = '#e4e4e7';
const BLEED = 56;
const BURST = 28;
const IDLE_OPACITY = 0.8;
const IDLE_SPAWN = 0.6;
const ACTIVE_SPAWN = 0.02;
type Stars = { rand: () => number; particles: Particle[]; last: number; spawn: number; fade: number; hovered: boolean };
let stars: Stars | null = null;

function star(ctx: Ctx2D, p: Particle, opacity: number) {
  const r = p.size;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.globalAlpha = opacity;
  ctx.fillStyle = STAR;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.bezierCurveTo(r * 0.2, -r * 0.2, r * 0.2, -r * 0.2, r, 0);
  ctx.bezierCurveTo(r * 0.2, r * 0.2, r * 0.2, r * 0.2, 0, r);
  ctx.bezierCurveTo(-r * 0.2, r * 0.2, -r * 0.2, r * 0.2, -r, 0);
  ctx.bezierCurveTo(-r * 0.2, -r * 0.2, -r * 0.2, -r * 0.2, 0, -r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawStars(ctx: Ctx2D, f: Frame, [hoveredArg, seed]: number[]): boolean {
  const { width, height } = f, hovered = hoveredArg === 1;
  const make = (s: Stars, atY: number | undefined, idle: boolean): Particle => {
    const r = s.rand, x = BLEED + 16 + r() * (width - 2 * BLEED - 32);
    if (idle || !hovered) {
      return { x, y: atY ?? height, size: idle ? 2 + r() * 2 : 3 + r() * 3, speed: idle ? 40 + r() * 30 : 80 + r() * 60, vx: 0, opacity: atY ? 0.8 : 0, rotation: r() * Math.PI * 2, rotationSpeed: (r() - 0.5) * 3 };
    }
    const fromCenter = (x - width / 2) / (width / 2);
    return { x, y: atY ?? height, size: 3.5 + r() * 5, speed: 150 + r() * 190, vx: fromCenter * (60 + r() * 90) + (r() - 0.5) * 60, opacity: 0.6, rotation: r() * Math.PI * 2, rotationSpeed: (r() - 0.5) * 9 };
  };
  if (!stars || f.cause === 'mount') {
    const s: Stars = { rand: stream(seed * 40503 + 7), particles: [], last: f.time, spawn: 0, fade: IDLE_OPACITY, hovered };
    for (let i = 0; i < 3; i++) s.particles.push(make(s, height * (0.2 + s.rand() * 0.6), true));
    stars = s;
  }
  const s = stars;
  if (hovered !== s.hovered) {
    s.hovered = hovered;
    s.last = f.time;
    // Entering: a burst, then the fountain.
    if (hovered) for (let i = 0; i < BURST; i++) { const p = make(s, undefined, false); p.y = height - s.rand() * 12; p.speed *= 0.8 + s.rand() * 0.6; s.particles.push(p); }
  }
  const dt = Math.max(0, Math.min((f.time - s.last) / 1000, 0.1));
  s.last = f.time;
  ctx.clearRect(0, 0, width, height);
  const target = hovered ? 1 : IDLE_OPACITY;
  s.fade = s.fade < target ? Math.min(target, s.fade + dt * 4) : Math.max(target, s.fade - dt * 2);
  s.spawn += dt;
  if (s.spawn > (hovered ? ACTIVE_SPAWN : IDLE_SPAWN)) { s.spawn = 0; s.particles.push(make(s, undefined, !hovered)); }
  s.particles = s.particles.filter((p) => {
    p.y -= p.speed * dt;
    p.x += p.vx * dt;
    p.rotation += p.rotationSpeed * dt;
    const progress = 1 - p.y / height;
    if (progress < 0.15) p.opacity = Math.min(1, p.opacity + dt * 6);
    else if (progress > 0.75) p.opacity = Math.max(0, p.opacity - dt * 3);
    const o = p.opacity * s.fade;
    if (o > 0.01) star(ctx, p, o);
    return p.y > -10;
  });
  return true;
}

export const heroSurfaces: Record<string, number> = { spiral: 2, stars: 2 };
export function drawHero(surface: string, args: any[], ctx: Ctx2D, frame: Frame): boolean {
  return surface === 'spiral' ? drawSpiral(ctx, frame, args) : drawStars(ctx, frame, args);
}

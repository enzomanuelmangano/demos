// Shared helpers of the canvas article demos (animated-gradient, animated-loader-skia, animated-spiral, metaball):
// the reference's src/lib/animation (Reanimated stand-ins) and the bits of Canvas 2D its demos rely on that the
// Exact recorder does not take (`ctx.filter`): the blurred halo of Skia's `BlurMask style="solid"` is drawn as
// shadows instead, in bitmap pixels as `ctx.filter` blurs.
import type { Ctx2D, Frame } from '../../../app.contract.d.ts';

export type { Ctx2D, Frame };

/** `withTiming`'s default easing in Reanimated (the reference's easeInOutQuad). */
export const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Reanimated's `interpolate`, clamped at both ends (the reference's). */
export function interpolate(value: number, input: readonly number[], output: readonly number[]): number {
  if (value <= input[0]) return output[0];
  const last = input.length - 1;
  if (value >= input[last]) return output[last];
  for (let i = 1; i <= last; i++) {
    if (value <= input[i]) {
      const t = (value - input[i - 1]) / (input[i] - input[i - 1]);
      return output[i - 1] + (output[i] - output[i - 1]) * t;
    }
  }
  return output[last];
}

/** mulberry32. Data modules may not call Math.random: a press seeds a stream from the frame's time instead. */
export function stream(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seeded = (time: number, salt: number) => stream(Math.floor(time * 1000) ^ Math.imul(salt + 1, 0x9e3779b1));

export type Rgb = [number, number, number];
/** A colour stop list sampled as Canvas 2D interpolates a gradient: unpremultiplied sRGB, linear in t. */
export function sample(stops: readonly [number, Rgb][], t: number): Rgb {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i++) {
    const [t1, c1] = stops[i];
    if (t <= t1) {
      const [t0, c0] = stops[i - 1], k = (t - t0) / (t1 - t0 || 1);
      return [c0[0] + (c1[0] - c0[0]) * k, c0[1] + (c1[1] - c0[1]) * k, c0[2] + (c1[2] - c0[2]) * k];
    }
  }
  return stops[stops.length - 1][1];
}
export const rgb = (c: Rgb, a = 1) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${a})`;

export const CYAN: Rgb = [0, 255, 255], MAGENTA: Rgb = [255, 0, 255], YELLOW: Rgb = [255, 255, 0];
/** The reference's sweep: cyan, magenta at 1/3, yellow at 2/3, cyan. */
export const SWEEP: [number, Rgb][] = [[0, CYAN], [1 / 3, MAGENTA], [2 / 3, YELLOW], [1, CYAN]];
export function sweepGradient(ctx: Ctx2D, x: number, y: number, stops: readonly [number, Rgb][] = SWEEP, angle = 0) {
  const g = ctx.createConicGradient(angle, x, y);
  for (const [t, c] of stops) g.addColorStop(t, rgb(c));
  return g;
}

/** The angle of a point around a centre as a conic gradient measures it: 0 at 3 o'clock, clockwise, in [0, 1). */
export const turn = (dx: number, dy: number) => {
  const a = Math.atan2(dy, dx) / (Math.PI * 2);
  return a < 0 ? a + 1 : a;
};

/**
 * `ctx.filter = 'blur(5px)'` under a shape, without filters: the shape drawn far off the canvas with a shadow cast back
 * onto it, in `buckets` angular pieces each shadowed in the sweep's colour at its middle. Pieces that only touch
 * (an arc's) add up ('lighter'), so their halos sum as one blur of the whole would; pieces that overlap (dots) are
 * laid over each other, as one path's fill covers a point once. `sigma` is in bitmap pixels, as a filter's length is.
 */
export const HALO_OFFSET = 10000;
export function halo(ctx: Ctx2D, f: Frame, sigma: number, buckets: number, color: (t: number) => Rgb, piece: (from: number, to: number) => void, add = true) {
  ctx.save();
  ctx.globalCompositeOperation = add ? 'lighter' : 'source-over';
  ctx.shadowBlur = (2 * sigma) / f.scale;
  ctx.shadowOffsetX = HALO_OFFSET;
  ctx.fillStyle = '#000';
  ctx.strokeStyle = '#000';
  for (let b = 0; b < buckets; b++) {
    ctx.shadowColor = rgb(color((b + 0.5) / buckets));
    piece(b / buckets, (b + 1) / buckets);
  }
  ctx.restore();
}

/** Per-canvas memory of a surface: by the demo's key and the canvas's mount time, so the same demo twice on a page
 * (animated-spiral shows AnimatedSpiralWithSkia at its top and its end) keeps two memories. */
export function memo<T>() {
  const all = new Map<string, T>();
  return (key: string, f: Frame, make: () => T): T => {
    const id = `${key}@${f.mounted}`;
    let s = all.get(id);
    if (!s) {
      s = make();
      all.set(id, s);
      if (all.size > 64) all.delete(all.keys().next().value!);
    }
    return s;
  };
}

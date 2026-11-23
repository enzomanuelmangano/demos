#!/usr/bin/env bun
// Bakes the reference's `spring()` (src/lib/animation/value.ts: semi-implicit Euler, one step per frame, the first
// frame's dt 0, at rest within 0.01 at under 0.01/s) at 60 Hz into Contract keyframes, one stop per frame, so a
// demo's spring plays as a CSS animation on the compositor exactly as the reference draws it on a 60 Hz screen.
// Writes the block between `// <baked>` and `// </baked>` in each target file.
//   bun components/interactive/gesture-kit/.tools/bake.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const FRAME = 1000 / 60;
type Spring = { damping?: number; stiffness?: number; mass?: number };

/** The values at each frame from `from` to `to`, as the reference integrates them (frame 0 is `from`). */
export function spring(from: number, to: number, { damping = 10, stiffness = 100, mass = 1 }: Spring = {}) {
  let x = from, v = 0;
  const out = [x];
  // frame 0 has dt 0 (`last` was null): nothing moves; then one step per frame.
  for (let i = 1; i < 2000; i++) {
    const dt = Math.min(FRAME / 1000, 1 / 30);
    const a = (-stiffness * (x - to) - damping * v) / mass;
    v += a * dt;
    x += v * dt;
    if (Math.abs(x - to) < 0.01 && Math.abs(v) < 0.01) { out.push(to); break; }
    out.push(x);
  }
  return out;
}

const r = (n: number, d = 4) => String(Math.round(n * 10 ** d) / 10 ** d);
/**
 * A keyframes block of at most 32 stops (Contract's limit) that plays the frames exactly: stops at every turning
 * point plus evenly between, each segment a cubic Hermite in time through the frames' values and slopes, written as
 * the stop's `animation-timing-function: cubic-bezier(1/3, y1, 2/3, y2)` (x linear in time, so y is the Hermite).
 * `rows(value)` writes a stop's properties. Prints the largest error against the frames, in the value's units.
 */
function keyframes(name: string, xs: number[], rows: (v: number) => string) {
  const n = xs.length - 1, dt = FRAME / 1000;
  const vel = xs.map((_, i) => (i === 0 || i === n ? 0 : (xs[i + 1] - xs[i - 1]) / (2 * dt)));
  const turns = [0];
  for (let i = 1; i < n; i++) if (Math.sign(xs[i] - xs[i - 1]) !== Math.sign(xs[i + 1] - xs[i]) && xs[i + 1] !== xs[i]) turns.push(i);
  turns.push(n);
  // split each run between turning points into pieces of at most `step` frames, the fewest pieces under 32 stops
  let stops: number[] = [];
  for (let step = 1; ; step++) {
    stops = [0];
    for (let k = 1; k < turns.length; k++) {
      const a = turns[k - 1], b = turns[k], pieces = Math.max(1, Math.ceil((b - a) / step));
      for (let j = 1; j <= pieces; j++) stops.push(Math.round(a + ((b - a) * j) / pieces));
    }
    stops = [...new Set(stops)];
    if (stops.length <= 32) break;
  }
  const bez = (s: number, e: number) => {
    const T = (e - s) * dt, d = xs[e] - xs[s];
    if (Math.abs(d) < 1e-9) return { f: 'linear', y: (u: number) => xs[s] };
    const m0 = (vel[s] * T) / d, m1 = (vel[e] * T) / d;
    const y1 = m0 / 3, y2 = 1 - m1 / 3;
    const h = (u: number) => 3 * (1 - u) * (1 - u) * u * y1 + 3 * (1 - u) * u * u * y2 + u * u * u;
    return { f: `cubic-bezier(0.3333, ${r(y1)}, 0.6667, ${r(y2)})`, y: (u: number) => xs[s] + d * h(u) };
  };
  let worst = 0;
  const lines = stops.map((i, k) => {
    const pct = r((i / n) * 100, 3);
    if (k === stops.length - 1) return `  ${pct}% ${rows(xs[i])}`;
    const b = bez(i, stops[k + 1]);
    for (let f = i; f <= stops[k + 1]; f++) worst = Math.max(worst, Math.abs(b.y((f - i) / (stops[k + 1] - i)) - xs[f]));
    return `  ${pct}% ${rows(xs[i])} animation-timing-function="${b.f}"`;
  });
  console.log(`${name}: ${stops.length} stops, worst error ${worst.toExponential(2)}`);
  return { text: `keyframes ${name}\n${lines.join('\n')}`, ms: Math.round(n * FRAME) };
}

function write(file: string, blocks: { text: string; ms: number; name: string }[]) {
  const s = readFileSync(file, 'utf8');
  const a = s.indexOf('// <baked>'), b = s.indexOf('// </baked>');
  if (a < 0 || b < 0) throw new Error(`${file}: no // <baked> … // </baked> block`);
  const body = blocks.map((k) => k.ms ? `// ${k.name}: ${k.ms} ms\n${k.text}\nfn ${k.name}Ms(): number = ${k.ms}` : k.text).join('\n\n');
  writeFileSync(file, `${s.slice(0, a)}// <baked> (gesture-kit/.tools/bake.ts writes this block)\n${body}\n${s.slice(b)}`);
  console.log(file, blocks.map((k) => `${k.name} ${k.ms}ms`).join(', '));
}

const root = join(import.meta.dir, '../..');
const named = (name: string, k: { text: string; ms: number }) => ({ name, ...k });

/** MorphSquare's eight keyframes (gesture-kit/box.contract) for radii `rs` (one per stop, or two for a timed path). */
function morph(prefix: string, rs: number[], size: number, rmax: number, timed: boolean) {
  const parts: [string, (r: number) => string][] = [
    ['T', (r) => `translate="0px ${r4(r)}px"`],
    ['B', (r) => `translate="0px ${r4(-r)}px"`],
    ['L', (r) => `translate="${r4(r)}px 0px"`],
    ['R', (r) => `translate="${r4(-r)}px 0px"`],
    ['TL', (r) => `scale=${r4(r / rmax)} translate="${r4(r - rmax)}px ${r4(r - rmax)}px"`],
    ['TR', (r) => `scale=${r4(r / rmax)} translate="${r4(rmax - r)}px ${r4(r - rmax)}px"`],
    ['BL', (r) => `scale=${r4(r / rmax)} translate="${r4(r - rmax)}px ${r4(rmax - r)}px"`],
    ['BR', (r) => `scale=${r4(r / rmax)} translate="${r4(rmax - r)}px ${r4(rmax - r)}px"`],
  ];
  return parts.map(([part, row]) => timed
    ? { name: prefix + part, ms: 0, text: `keyframes ${prefix + part}\n  from ${row(rs[0])}\n  to ${row(rs[1])}` }
    : named(prefix + part, keyframes(prefix + part, rs, row)));
}
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);

// introduction-to-reanimated: scale 1 → 2 and the final square's progress 1 → 0.5 and scale 2 → 1, each
// withSpring({ damping: 10, stiffness: 100 }).
const up = spring(1, 2), progress = spring(1, 0.5), down = spring(2, 1);
write(join(root, 'introduction-to-reanimated/index.contract'), [
  named('irScaleUp', keyframes('irScaleUp', up, (v) => `scale=${r(v)}`)),
  named('irFinalProgress', keyframes('irFinalProgress', progress, (v) => `opacity=${r(v)} rotate="${r(v * 360, 3)}deg"`)),
  ...morph('irFinalCorner', progress.map((p) => p * 50), 100, 50, false),
  ...morph('irRadiusCorner', [50, 25], 100, 50, true),
  named('irFinalScale', keyframes('irFinalScale', down, (v) => `scale=${r(v)}`)),
]);

// css-animations-react-native: corners 0 → 20 on a 100 px square, on the square's own timing.
write(join(root, 'css-animations-react-native/index.contract'), morph('caCorner', [0, 20], 100, 20, true));

// checkbox-interactions: the check icon's scale on framer-motion's spring (stiffness 500, damping 25, mass 1: an
// analytic spring, integrated finely here and sampled per frame), 0.5 → 1 coming in, back to 0.5 going out with its
// opacity (150 ms) on the way.
function fine(from: number, to: number, k: number, c: number, m = 1) {
  const sub = 20, h = 1 / 60 / sub;
  let x = from, v = 0;
  const out = [x];
  for (let i = 1; i < 600; i++) {
    for (let j = 0; j < sub; j++) { const a = (-k * (x - to) - c * v) / m; v += a * h; x += v * h; }
    // framer's rest: within 0.01 at under 0.1/s (its default restDelta and restSpeed for a scale)
    if (Math.abs(x - to) < 0.01 && Math.abs(v) < 0.1) { out.push(to); break; }
    out.push(x);
  }
  return out;
}
const iconIn = fine(0.5, 1, 500, 25), iconOut = fine(1, 0.5, 500, 25);
write(join(root, 'checkbox-interactions/index.contract'), [
  named('cbIconIn', keyframes('cbIconIn', iconIn, (v) => `scale=${r(v)}`)),
  named('cbIconOut', keyframes('cbIconOut', iconOut, (v, ) => `scale=${r(v)}`)),
]);

// animated-gradient: the reference's content/articles/animated-gradient/components/animated-gradient/base.tsx.
// A linear gradient from the canvas's top-left to its bottom-right corner, red to blue; Play eases both colours to
// random ones (250 ms, easeInOutQuad, from the colours last aimed at), or swaps them at once when `animated` is false
// (the "glitched" version). `gradient(key, animated, presses, kind)`: `presses` counts Play/Reset presses, `kind` is
// the last one's ("play" or "reset").
import { easeInOutQuad, memo, seeded, type Ctx2D, type Frame, type Rgb } from '../_canvas/util';

const RED: Rgb = [255, 0, 0], BLUE: Rgb = [0, 0, 255];
const DURATION = 250;

/** The reference's getRandomColor: `#` + a random 24-bit number in hex, unpadded. A shorter string is still a colour
 * when it has 3 or 4 digits (#rgb, #rgba) and none when it has 5: the canvas then keeps its last fillStyle (black). */
function randomColor(r: () => number): Rgb {
  const hex = Math.floor(r() * 16777215).toString(16);
  if (hex.length === 6) return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
  if (hex.length === 3 || hex.length === 4) return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16)) as Rgb;
  return [0, 0, 0];
}
const mix = (a: Rgb, b: Rgb, t: number) => `rgb(${a.map((c, i) => Math.round(c + (b[i] - c) * t)).join(', ')})`;

type State = { from: [Rgb, Rgb]; to: [Rgb, Rgb]; start: number; presses: number };
const state = memo<State>();

export function drawGradient(ctx: Ctx2D, f: Frame, [key, animated, presses, kind]: [string, boolean, number, string]): boolean {
  const s = state(key, f, () => ({ from: [RED, BLUE], to: [RED, BLUE], start: -Infinity, presses }));
  if (presses !== s.presses) {
    s.presses = presses;
    const r = seeded(f.time, presses);
    s.from = s.to;
    s.to = kind === 'reset' ? [RED, BLUE] : [randomColor(r), randomColor(r)];
    s.start = f.time;
  }
  const t = animated ? Math.min((f.time - s.start) / DURATION, 1) : 1;
  const e = easeInOutQuad(t);
  const g = ctx.createLinearGradient(0, 0, f.width, f.height);
  g.addColorStop(0, mix(s.from[0], s.to[0], e));
  g.addColorStop(1, mix(s.from[1], s.to[1], e));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, f.width, f.height);
  return t < 1;
}

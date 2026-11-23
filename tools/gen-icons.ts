// Bakes the iOS app-icon shape into the home icons' alpha, so the home draws them with no
// corner clip, no mask and no shadow (each of those is an offscreen pass on every scroll and
// launch-zoom frame).
//
//   bun tools/gen-icons.ts
//
// Reads the originals (legacy/assets/app-icons/*.png, the RN app's, square) and writes the shaped
// copies over assets/app-icons/. It always bakes from the originals, so running it
// again never rounds twice. tools/gen-demos.ts runs it right after copying the icons in.
//
// The shape: a square of corner radius 0.2237 of the side with continuous curvature (Figma's
// 60% corner smoothing, the iOS app-icon curve), drawn at 3x and averaged down for a clean edge.
// 192 px is the 62 pt icon at 3x. Needs ImageMagick (`magick`); no PNG codec is installed otherwise.
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const APP = resolve(import.meta.dir, '..');
const RN = resolve(APP, 'legacy');

export const ICON_PX = 192;
const RADIUS = 0.2237;
const SMOOTHING = 0.6;
const SUPERSAMPLE = 3;

/** The outline of a `size` square as an SVG path, corners with `smoothing` (figma-squircle's maths). */
export function squirclePath(size: number, radius: number, smoothing: number): string {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const budget = size / 2;
  const r = Math.min(radius, budget);
  const s = Math.min(smoothing, budget / r - 1);
  const p = Math.min((1 + s) * r, budget);
  const arcMeasure = 90 * (1 - s);
  const arc = Math.sin(rad(arcMeasure / 2)) * r * Math.SQRT2;
  const alpha = (90 - arcMeasure) / 2;
  const p3p4 = r * Math.tan(rad(alpha / 2));
  const beta = 45 * s;
  const c = p3p4 * Math.cos(rad(beta));
  const d = c * Math.tan(rad(beta));
  const b = (p - arc - c - d) / 3;
  const a = 2 * b;
  const n = (v: number) => +v.toFixed(4);
  const q = (...v: number[]) => v.map(n).join(' ');
  const w = size;
  return [
    `M ${q(w - p, 0)}`,
    `c ${q(a, 0, a + b, 0, a + b + c, d)} a ${q(r, r)} 0 0 1 ${q(arc, arc)} c ${q(d, c, d, b + c, d, a + b + c)}`,
    `L ${q(w, w - p)}`,
    `c ${q(0, a, 0, a + b, -d, a + b + c)} a ${q(r, r)} 0 0 1 ${q(-arc, arc)} c ${q(-c, d, -(b + c), d, -(a + b + c), d)}`,
    `L ${q(p, w)}`,
    `c ${q(-a, 0, -(a + b), 0, -(a + b + c), -d)} a ${q(r, r)} 0 0 1 ${q(-arc, -arc)} c ${q(-d, -c, -d, -(b + c), -d, -(a + b + c))}`,
    `L ${q(0, p)}`,
    `c ${q(0, -a, 0, -(a + b), d, -(a + b + c))} a ${q(r, r)} 0 0 1 ${q(arc, -arc)} c ${q(c, -d, b + c, -d, a + b + c, -d)}`,
    'Z',
  ].join(' ');
}

const magick = async (args: string[]) => {
  const proc = Bun.spawn(['magick', ...args], { stdout: 'pipe', stderr: 'pipe' });
  const [err, code] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) throw new Error(`magick ${args.slice(0, 3).join(' ')}: ${err}`);
};

/** The coverage mask (white inside) at the icon's size. */
export async function renderMask(path: string, px = ICON_PX): Promise<void> {
  const big = px * SUPERSAMPLE;
  await magick([
    '-size', `${big}x${big}`, 'xc:black', '-fill', 'white', '-draw', `path '${squirclePath(big, big * RADIUS, SMOOTHING)}'`,
    '-filter', 'Box', '-resize', `${px}x${px}`, '-colorspace', 'Gray', '-depth', '8', path,
  ]);
}

/** Bakes every icon already copied into the app (a name in `names`, or all of them). */
export async function bakeIcons(names?: string[]): Promise<number> {
  const outDir = resolve(APP, 'assets/app-icons');
  const files = (names ?? readdirSync(outDir)).filter(f => f.endsWith('.png') && existsSync(resolve(RN, 'assets/app-icons', f)));
  const tmp = mkdtempSync(join(tmpdir(), 'icons-'));
  try {
    const mask = join(tmp, 'mask.png');
    await renderMask(mask);
    let next = 0;
    const worker = async () => {
      for (let i = next++; i < files.length; i = next++) {
        const input = resolve(RN, 'assets/app-icons', files[i]);
        await magick([
          input, '-resize', `${ICON_PX}x${ICON_PX}!`, '-alpha', 'off', mask, '-compose', 'CopyOpacity', '-composite',
          '-define', 'png:compression-level=9', '-define', 'png:exclude-chunks=all', 'PNG32:' + resolve(outDir, files[i]),
        ]);
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    return files.length;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (import.meta.main) console.log(`${await bakeIcons()} icons baked`);

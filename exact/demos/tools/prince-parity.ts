// the-little-prince: RN's own layout and targets code (src/animations/text-image-morph:
// atlas.ts, layout.ts, sampling.ts) run on the same inputs as the Rust surface, compared number
// for number with what the surface computed.
//
//   PRINCE_DUMP=/tmp/prince.json cargo test -q -p demos-gpu prince_dump
//   bun tools/prince-parity.ts /tmp/prince.json
//
// Inputs given to RN's code: prince.png's own RGBA samples (decoded by PIL, no colour
// conversion, as Skia's readPixels with no colour space returns them), the font's advances
// as the surface measured them (Core Text's, f32: the Rust test advances_are_core_texts), and
// Math.random replaced by the surface's stream (mulberry32, 53-bit doubles) from the same
// state. Every pageXY, picXY and delay must be the same f32.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../../..');
const morph = resolve(root, 'src/animations/text-image-morph');

Bun.plugin({
  setup(build) {
    build.module('react-native-skia', () => ({
      exports: {
        AlphaType: { Unpremul: 3 },
        ColorType: { RGBA_8888: 4 },
        rect: (x: number, y: number, width: number, height: number) => ({ x, y, width, height }),
      },
      loader: 'object',
    }));
  },
});

const { buildAtlas } = await import(resolve(morph, 'atlas.ts'));
const { buildLayout } = await import(resolve(morph, 'layout.ts'));
const { computeTargets } = await import(resolve(morph, 'sampling.ts'));
const { LITTLE_PRINCE_TEXT } = await import(resolve(root, 'src/animations/the-little-prince/text.ts'));

const png = resolve(root, 'src/animations/the-little-prince/assets/prince.png');
const py = spawnSync(
  'python3',
  ['-c', 'import sys; from PIL import Image; im = Image.open(sys.argv[1]); assert im.mode == "RGBA"; sys.stdout.buffer.write(im.tobytes())', png],
  { maxBuffer: 1 << 26 },
);
if (py.status !== 0) {
  throw new Error(py.stderr.toString());
}
const rgba = new Uint8Array(py.stdout);
const image = {
  width: () => 910,
  height: () => 1218,
  readPixels: () => rgba,
};

const stream = (state: number) => {
  let s = state >>> 0;
  const word = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
  return () => {
    const a = word() >>> 5;
    const b = word() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  };
};

const cases = JSON.parse(readFileSync(process.argv[2] ?? '/tmp/prince.json', 'utf8'));
let failed = 0;
for (const c of cases) {
  const widths = new Map<number, number>(c.advances.map(([cp, w]: [number, number]) => [cp, w]));
  const font = {
    getGlyphIDs: (ch: string) => [ch.codePointAt(0)],
    getGlyphWidths: (ids: number[]) => ids.map(id => widths.get(id)),
  };
  const atlas = buildAtlas(LITTLE_PRINCE_TEXT);
  const layout = buildLayout(atlas, LITTLE_PRINCE_TEXT, font, c.width, c.height);
  Math.random = stream(c.state);
  const targets = computeTargets(layout.pageXY, image, c.width, c.height);
  const diff = (name: string, rn: Float32Array, rust: number[]) => {
    if (rn.length !== rust.length) {
      failed++;
      return console.log(`${c.width}×${c.height} ${name}: ${rn.length} vs ${rust.length} values`);
    }
    let n = 0;
    let max = 0;
    for (let i = 0; i < rn.length; i++) {
      if (rn[i] !== rust[i]) {
        n++;
        max = Math.max(max, Math.abs(rn[i] - rust[i]));
      }
    }
    if (n) {
      failed++;
    }
    console.log(`${c.width}×${c.height} ${name}: ${rn.length} values, ${n} differ${n ? ` (max ${max})` : ''}`);
  };
  diff('pageXY', layout.pageXY, c.pageXY);
  diff('picXY', targets.picXY, c.picXY);
  diff('delays', targets.delays, c.delays);
}
process.exit(failed ? 1 : 0);

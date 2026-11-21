// The QR demos' matrices and the qrcode demo's DiscretePathEffect, from the real libraries, for
// gpu/src/qr.rs's tests.
//
//   bun exact/parity-tools/qr/qr-matrix.ts
//
// reference.txt: qrcode 1.5.4's QRCode.create(text, { errorCorrectionLevel }) (what
// react-native-qrcode-skia's generateMatrix and the notion / cherry-blossom demos call) over a
// corpus: the demos' own values, mode mixes that exercise the segment graph, non-ASCII, and
// seeded random strings up to the qrcode demo's 300 units, at every level. Per line: level,
// version, mask, the modules as hex (row-major, 4 per digit), the text as JSON.
//
// discrete.txt: react-native-qrcode-skia's rounded path for "reactiive.io" at H, size 378 (the
// qrcode demo on a 420 pt wide phone: windowWidth * 0.9), under DiscretePathEffect(10, 3) (the
// slider's resting deviation, 0.5 * 6): SkDiscretePathEffect's onFilterPath written over
// CanvasKit's own ContourMeasureIter (getPosTan is Skia's), in float. The script also renders
// that output and CanvasKit's MakeDiscrete(10, 3, 0) on the same path, without antialiasing at
// 4x, and fails if a pixel differs: the transcription is the effect.
import { writeFileSync } from 'node:fs';
import QRCode from '../../../node_modules/qrcode/lib/index.js';
import CanvasKitInit from '../../../node_modules/canvaskit-wasm/bin/canvaskit.js';

const here = new URL('./', import.meta.url).pathname;

// ─── corpus ──────────────────────────────────────────────────────────────────────────────────
const fixed = [
  'reactiive.io',
  'https://reactiive.io/demos',
  'https://www.reactiive.io',
  'https://enzo.fyi',
  'a',
  '0',
  '01234567',
  'HELLO WORLD',
  'Hello, World!',
  '1234567890123456789012345678901234567890',
  'ABC123DEF456',
  'abc123456789012def',
  'HTTPS://REACTIIVE.IO/DEMOS',
  'tel:+390000000000',
  'WIFI:S:home;T:WPA;P:12345678;;',
  'caffè latte',
  'こんにちは世界',
  '日本語テキスト123ABC',
  '🙂🚀 emoji',
  'mixed ÀÉÎ 123 ABC def',
  'MATMSG:TO:a@b.c;SUB:hi;BODY:12345;;',
  '000000000000000000000000000000ABCDEFGHIJ',
  'A1B2C3D4E5F6G7H8I9J0',
  ' ',
  '$%*+-./:',
];
let seed = 12345;
const rnd = () => {
  seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
  return seed / 4294967296;
};
const pools = [
  '0123456789',
  'ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:',
  'abcdefghijklmnopqrstuvwxyz',
  '0123456789ABCDEFXYZ',
  'abc0123ABC .:/',
  'éàüßñçøå',
  'あいうえお漢字',
];
const random: string[] = [];
for (let k = 0; k < 90; k++) {
  const len = k < 60 ? 1 + Math.floor(rnd() * 40) : 40 + Math.floor(rnd() * 260);
  let s = '';
  while (s.length < len) {
    // Runs from one pool, so mode switches happen at random places.
    const pool = pools[Math.floor(rnd() * pools.length)];
    const run = 1 + Math.floor(rnd() * 12);
    for (let i = 0; i < run && s.length < len; i++) s += pool[Math.floor(rnd() * pool.length)];
  }
  random.push(s);
}
const lines: string[] = [];
for (const text of [...fixed, ...random]) {
  for (const ecl of ['L', 'M', 'Q', 'H']) {
    let qr;
    try {
      qr = QRCode.create(text, { errorCorrectionLevel: ecl });
    } catch {
      continue; // too long for this level
    }
    const d = qr.modules.data;
    let hex = '';
    for (let i = 0; i < d.length; i += 4) {
      let v = 0;
      for (let k = 0; k < 4; k++) v |= (i + k < d.length ? d[i + k] : 0) << (3 - k);
      hex += v.toString(16);
    }
    lines.push(`${ecl}\t${qr.version}\t${qr.maskPattern}\t${hex}\t${JSON.stringify(text)}`);
  }
}
writeFileSync(here + 'reference.txt', lines.join('\n') + '\n');
console.log(`reference.txt: ${lines.length} symbols`);

// ─── the rounded path (react-native-qrcode-skia 0.3.1, verbatim) ────────────────────────────
const matrixOf = (value: string, ecl: string) => {
  const arr = Array.prototype.slice.call(QRCode.create(value, { errorCorrectionLevel: ecl }).modules.data, 0);
  const sqrt = Math.sqrt(arr.length);
  return arr.reduce((rows: number[][], key: number, index: number) => (index % sqrt === 0 ? rows.push([key]) : rows[rows.length - 1].push(key)) && rows, []);
};
const roundedPath = (matrix: number[][], size: number) => {
  const cellSize = size / matrix.length;
  let path = '';
  const gap = 0;
  matrix.forEach((row, i) => {
    row.forEach((cell, j) => {
      if (cell !== 1) return;
      const x = j * cellSize;
      const y = i * cellSize;
      const padding = gap / 2;
      const offset = (cellSize - gap) / 2;
      const q1 = { x: x + cellSize - padding, y: y + padding };
      const q2 = { x: x + cellSize - padding, y: y + cellSize - padding };
      const q3 = { x: x + padding, y: y + cellSize - padding };
      const q4 = { x: x + padding, y: y + padding };
      const d1 = { x: x + cellSize - padding - offset, y: y + padding };
      const d2 = { x: x + cellSize - padding, y: y + cellSize - padding - offset };
      const d3 = { x: x + padding + offset, y: y + cellSize - padding };
      const d4 = { x: x + padding, y: y + padding + offset };
      const n = {
        top: i > 0 && matrix[i - 1]?.[j] === 1,
        right: j < matrix.length - 1 && matrix[i]?.[j + 1] === 1,
        bottom: i < matrix.length - 1 && matrix[i + 1]?.[j] === 1,
        left: j > 0 && matrix[i]?.[j - 1] === 1,
      };
      const d1d2 = n.top || n.right ? `L${q1.x} ${q1.y} L${d2.x} ${d2.y}` : `L${d1.x} ${d1.y} Q${q1.x} ${q1.y} ${d2.x} ${d2.y}`;
      const d2d3 = n.right || n.bottom ? `L${q2.x} ${q2.y} L${d3.x} ${d3.y}` : `L${d2.x} ${d2.y} Q${q2.x} ${q2.y} ${d3.x} ${d3.y}`;
      const d3d4 = n.bottom || n.left ? `L${q3.x} ${q3.y} L${d4.x} ${d4.y}` : `L${d3.x} ${d3.y} Q${q3.x} ${q3.y} ${d4.x} ${d4.y}`;
      const d4d1 = n.left || n.top ? `L${q4.x} ${q4.y} L${d1.x} ${d1.y}` : `L${d4.x} ${d4.y} Q${q4.x} ${q4.y} ${d1.x} ${d1.y}`;
      path += `M${d1.x} ${d1.y} ${d1d2} ${d2d3} ${d3d4} ${d4d1}`;
    });
  });
  return path;
};

// ─── SkDiscretePathEffect::onFilterPath over CanvasKit's ContourMeasure ──────────────────────
const bin = new URL('../../../node_modules/canvaskit-wasm/bin/', import.meta.url).pathname;
const CK = await CanvasKitInit({ locateFile: (f: string) => bin + f });
const f = Math.fround;
const SIZE = 378, SEG = 10, DEV = 3;
const svg = roundedPath(matrixOf('reactiive.io', 'H'), SIZE);
const src = CK.Path.MakeFromSVGString(svg)!;

const setLength = (x: number, y: number, len: number): [number, number] | null => {
  const mag = Math.sqrt(x * x + y * y);
  const s = len / mag;
  const nx = f(x * s), ny = f(y * s);
  if (!isFinite(nx) || !isFinite(ny) || (nx === 0 && ny === 0)) return null;
  return [nx, ny];
};
const out: number[] = [];
const cmds: number[][] = [];
{
  const iter = new CK.ContourMeasureIter(src, true, 1);
  let meas = iter.next();
  const firstLen = meas ? meas.length() : 0;
  const s0 = Math.floor(firstLen + 0.5) >>> 0;
  let r = (s0 ^ (((s0 << 16) | (s0 >>> 16)) >>> 0)) >>> 0;
  const next = () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return f((r | 0) >> 15) * f(1.52587890625e-5);
  };
  do {
    const length = meas ? meas.length() : 0;
    if (f(SEG * 3) > length) {
      throw new Error('a contour too short to mangle: not in this corpus');
    }
    let n = Math.floor(f(length / SEG) + 0.5);
    const delta = f(length / n);
    let distance = 0;
    const closed = meas!.isClosed();
    if (closed) {
      n -= 1;
      distance = f(distance + f(delta / 2));
    }
    const emit = (verb: number) => {
      const pt = meas!.getPosTan(distance);
      const scale = f(next() * DEV);
      const nrm = setLength(pt[3], -pt[2], scale) ?? [0, 0];
      const x = f(pt[0] + nrm[0]), y = f(pt[1] + nrm[1]);
      out.push(x, y);
      cmds.push([verb, x, y]);
    };
    emit(CK.MOVE_VERB);
    while (--n >= 0) {
      distance = f(distance + delta);
      emit(CK.LINE_VERB);
    }
    if (closed) cmds.push([CK.CLOSE_VERB]);
    meas = iter.next();
  } while (meas);
}
writeFileSync(here + 'discrete.txt', `${SIZE} ${SEG} ${DEV}\n${out.join(' ')}\n`);
console.log(`discrete.txt: ${out.length / 2} points`);

// The transcription against CanvasKit's own effect: both filled, no AA, 4x.
const raster = (draw: (c: any, p: any) => void) => {
  const surf = CK.MakeSurface(SIZE * 4, SIZE * 4)!;
  const c = surf.getCanvas();
  c.clear(CK.WHITE);
  c.scale(4, 4);
  const p = new CK.Paint();
  p.setAntiAlias(false);
  p.setColor(CK.BLACK);
  draw(c, p);
  const px = surf.makeImageSnapshot().readPixels(0, 0, { width: SIZE * 4, height: SIZE * 4, colorType: CK.ColorType.RGBA_8888, alphaType: CK.AlphaType.Unpremul, colorSpace: CK.ColorSpace.SRGB })!;
  surf.delete();
  return px;
};
const flat = cmds.flat();
const mine = CK.Path.MakeFromCmds(flat)!;
const a = raster((c, p) => c.drawPath(mine, p));
const b = raster((c, p) => {
  p.setPathEffect(CK.PathEffect.MakeDiscrete(SEG, DEV, 0));
  c.drawPath(src, p);
});
let diff = 0;
let ink = 0;
for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
for (let i = 0; i < a.length; i += 4) if (a[i] === 0) ink++;
if (ink < 100000) throw new Error(`only ${ink} dark pixels: the raster is not the QR`);
if (diff) throw new Error(`the transcription differs from MakeDiscrete in ${diff} bytes`);
console.log(`discrete: transcription renders identically to CanvasKit MakeDiscrete (${ink} dark pixels)`);

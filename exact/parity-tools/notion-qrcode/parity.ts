// The notion-qrcode demo's numbers as the RN app computes them, run by build.sh in the app's own
// Hermes, for gpu/src/notion_qrcode.rs's tests (reference.txt).
//
// shape: hooks/use-shape-data.ts computeShapeData("https://www.reactiive.io", DEFAULT_TORUS, 220,
// the sprite) on a 420 x 912 window: the torus (Fibonacci angles), the QR's black modules, both
// normalized, sortTorusByFlow and sortBySpiral (Array.prototype.sort with comparators that are
// not consistent orders, so the result is Hermes's sort's: an introsort, see notion_qrcode.rs),
// the greedy hungarianMatch, the avatar assignments and sprite rects. One FNV-1a (32-bit) over
// every number's float64 bytes (little-endian), in that order.
//
// frame <name>: create-picture.ts createPicture for one state (progress, iTime, staggerBaseTime,
// frozenRotationTime), Skia recorded by stubs.ts: per point drawn, the drawRRect (rect, radii,
// the paint's hsl() string and setAlphaf), and when the image shows save, clipRRect,
// drawImageRect (src, dst, alpha), restore. The hash runs over the numbers' float64 bytes and
// the strings' bytes (then a 0), in draw order.
//
// color <string>: every hsl() string those frames hand Skia.Color (for css-color.cpp, which runs
// RN Skia's own CSSColorParser over them).
import './setup';
import { computeShapeData } from '../../../src/animations/notion-qrcode/hooks/use-shape-data';
import { createBackgroundColors, createPicture } from '../../../src/animations/notion-qrcode/create-picture';
import { DEFAULT_COLORS, DEFAULT_TORUS } from '../../../src/animations/notion-qrcode/constants';
import { ops } from './stubs';

declare const print: (...a: string[]) => void;

const bytes = new DataView(new ArrayBuffer(8));
const fnv = (values: (number | string)[]) => {
  let h = 0x811c9dc5;
  const byte = (b: number) => {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  };
  for (const v of values) {
    if (typeof v === 'string') {
      for (let i = 0; i < v.length; i++) byte(v.charCodeAt(i));
      byte(0);
    } else {
      bytes.setFloat64(0, v, true);
      for (let i = 0; i < 8; i++) byte(bytes.getUint8(i));
    }
  }
  return ('00000000' + h.toString(16)).slice(-8);
};

const sprite = { source: 0, cols: 5, rows: 4, cellSize: 128, numAvatars: 20 };
const shape = computeShapeData('https://www.reactiive.io', DEFAULT_TORUS, 220, sprite as any);
const values: number[] = [shape.nPoints, shape.qrSize, shape.qrModuleSize];
for (let i = 0; i < shape.nPoints; i++) {
  const t = shape.allShapes[0][i];
  const q = shape.allShapes[1][i];
  values.push(t.x, t.y, t.z, q.x, q.y, q.z, shape.avatarAssignments[i]);
}
for (const c of shape.spriteCoords) values.push(c.x, c.y, c.w, c.h);
print('shape', fnv(values), 'n=' + shape.nPoints, 'size=' + shape.qrSize);
for (let i = 0; i < 3; i++) {
  const t = shape.allShapes[0][i];
  const q = shape.allShapes[1][i];
  print('#', String(i), String(t.x), String(t.y), String(t.z), String(q.x), String(q.y));
}

// [name, progress, iTime, staggerBaseTime, frozenRotationTime]
const frames: [string, number, number, number, number][] = [
  ['rest', 0, 1.234, 0, 0],
  ['rest-wrap', 0, 5.5, 0, 0],
  ['forward-30', 0.3, 20.7, 2.1, 2.1],
  ['forward-62', 0.62, 9.9, 3.05, 3.05],
  ['forward-97', 0.97, 3.3, 1.0, 1.0],
  ['qr', 1, 100.3, 0.4, 0.4],
  ['back-45', 0.45, 7.0, 6.1, 6.1],
  ['back-08', 0.08, 13.25, 0.2, 0.2],
];
const sv = (v: number) => ({ get: () => v });
const background = createBackgroundColors(DEFAULT_COLORS, shape.spriteCoords.length);
const colors = new Set<string>();
for (const [name, p, t, s, f] of frames) {
  ops.length = 0;
  createPicture({} as any, sv(p) as any, sv(t) as any, sv(s) as any, sv(f) as any, shape, DEFAULT_COLORS, 28, background);
  for (const o of ops) if (typeof o === 'string') colors.add(o);
  print('frame', name, fnv(ops), 'ops=' + ops.length);
}
for (const c of colors) print('color', c);

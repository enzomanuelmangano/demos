// The cherry-blossom-qrcode demo's CPU numbers as the RN app computes them, run by build.sh in
// the app's own Hermes, for gpu/src/cherry_blossom_qrcode.rs's tests (reference.txt):
//
// yaws <gridSize> <hex…>: utils/approach.ts validApproachYaws(gridSize) (Math.sin, Math.cos,
//   Math.hypot), each yaw's float64 bits, for every grid the scene can hold (versions 1-6).
// dest <hex x> <hex z>: approachDestination().
// blocks <json text> <numBlocks> <creeperStart> <gridSize> <fnv>: generateBlockData(
//   generateQRMatrix(text)) (the QR matrix through qrcode 1.5.4, Math.sqrt, Math.round,
//   Math.floor and pseudoRandom's Math.sin): one FNV-1a (32-bit) over the float64 bytes
//   (little-endian) of types, then positions, then resistance, then baseY, as the JS arrays hold
//   them before the Float32Array / Uint32Array upload.
// clamp <json text> <json clampToQRBytes(text)>.
import { approachDestination, validApproachYaws } from '../../../src/animations/cherry-blossom-qrcode/utils/approach';
import { generateBlockData } from '../../../src/animations/cherry-blossom-qrcode/utils/block-generator';
import { clampToQRBytes, generateQRMatrix } from '../../../src/animations/cherry-blossom-qrcode/utils/qr-matrix';

declare const print: (...a: string[]) => void;

const view = new DataView(new ArrayBuffer(8));
const hex = (v: number) => {
  view.setFloat64(0, v, false);
  let s = '';
  for (let i = 0; i < 8; i++) s += view.getUint8(i).toString(16).padStart(2, '0');
  return s;
};
const fnv = (lists: number[][]) => {
  let h = 0x811c9dc5;
  for (const list of lists) {
    for (const v of list) {
      view.setFloat64(0, v, true);
      for (let i = 0; i < 8; i++) {
        h ^= view.getUint8(i);
        h = Math.imul(h, 0x01000193) >>> 0;
      }
    }
  }
  return h.toString(16).padStart(8, '0');
};

for (const grid of [21, 25, 29, 33, 37, 41]) {
  print(['yaws', String(grid), ...validApproachYaws(grid).map(hex)].join(' '));
}
const d = approachDestination();
print(['dest', hex(d.x), hex(d.z)].join(' '));

const texts = [
  'https://enzo.fyi',
  '',
  'enzo',
  'https://www.reactiive.io/demos/cherry-blossom-qrcode',
  'x'.repeat(106),
  'Ünïcödé 🌸 さくら',
  'enzo.fyi/beta',
];
for (const text of texts) {
  const b = generateBlockData(generateQRMatrix(text));
  print(['blocks', JSON.stringify(text), String(b.numBlocks), String(b.creeperStart), String(b.gridSize), fnv([b.types, b.positions, b.resistance, b.baseY])].join(' '));
}
for (const text of ['abc', 'é'.repeat(60), '🌸'.repeat(30), 'a' + '🌸'.repeat(27) + 'b', 'さくら'.repeat(20)]) {
  print(['clamp', JSON.stringify(text), JSON.stringify(clampToQRBytes(text))].join(' '));
}

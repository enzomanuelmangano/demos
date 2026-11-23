// art-gallery: writes gpu/images/art-gallery/gallery.bin, everything the Rust surface
// (gpu/src/art_gallery.rs) reads besides RN's ASTC atlas, from the RN demo's own
// assets and code, and checks it against them.
//
//   bun tools/parity/art-gallery/build.ts
//
// What RN does at run time, and what this does once instead:
// - use-photo-atlas.ts parses assets/photos-compact.json (r, g, b, L, a, b per photo) and
//   assets/atlas-slots.json (each photo id's slot in the deduped atlas). The atlas mode needs
//   only the slots: u16 each here (< 979), exact.
// - A painting pick decodes the painting's JPEG with Skia (libjpeg-turbo, ISLOW IDCT, fancy
//   upsampling) and reads it back RGBA_8888 unpremultiplied with NO colour space (JsiSkImageInfo
//   ignores it: no ICC conversion), averages each grid cell (use-painting-analysis.ts), and
//   matches the cells to the photos' average RGB with the native ColorMatcher (C++). All of it
//   depends only on the bundled assets, so it is run here: the same decode (CanvasKit, Skia's
//   own codec, on the JPEG with its ICC segments dropped so CanvasKit's required sRGB read is
//   no conversion either; checked equal to libjpeg-turbo's djpeg byte for byte), RN's sampling
//   function verbatim, and RN's C++ matcher compiled from its source. The result per painting is
//   its image size, grid and one photo id per cell (u16, 0xFFFF where the matcher left the cell
//   empty, which RN then does not draw): 26 paintings, no JPEG and no matching on the phone.
//
// gallery.bin (little endian):
//   u16 photoCount, u16 atlasRows, u16 atlasCols, u16 paintingCount
//   u16 slot[photoCount]
//   per painting: u8 idLength, id (ASCII), u16 imageWidth, u16 imageHeight, u16 cols, u16 rows,
//                 u16 photoId[cols × rows]
//
// Checks (the build fails on any): the slots read back equal atlas-slots.json; photos-compact's
// 60000 numbers survive the quantised form (r, g, b as u8, L, a, b as round(v × 100) in i16)
// exactly as the doubles JSON.parse gives (the binary does not carry them: the matching ran
// here); every mapping
// read back equals the matcher's output; the two JSON files RN never loads (photos-manifest.json,
// atlas-info.json) are reported as what they hold.
//
// RN's matcher has no single answer. Its bucket threads (hardware_concurrency: 6 on the iPhone)
// steal photos from neighbouring buckets other threads own, unsynchronised: the same painting
// gives two or three mappings from run to run (tens to hundreds of cells apart), and now and
// then the race corrupts the heap. So the bake runs it as the phone does, 6 threads, RUNS times
// per painting and keeps the mapping it gives most often (the report lists the others).
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const root = new URL('../../../', import.meta.url).pathname;
const rn = `${root}legacy/src/animations/art-gallery/`;
const out = `${root}gpu/images/art-gallery/gallery.bin`;
const NM = `${root}../thank-you/legacy/node_modules/`;

Bun.plugin({
  name: 'jpg-path',
  setup(b) {
    b.onLoad({ filter: /\.jpg$/ }, a => ({ exports: { default: a.path }, loader: 'object' }));
  },
});
const { ART_MOVEMENTS } = await import(`${rn}paintings.ts`);
const { TARGET_CELLS } = await import(`${rn}constants.ts`);

const fail = (m: string): never => {
  throw new Error(m);
};

// ---- photos-compact.json, atlas-slots.json ----
const compact: number[] = await Bun.file(`${rn}assets/photos-compact.json`).json();
const slotsJson: { uniqueCount: number; rows: number; cols: number; slots: number[] } =
  await Bun.file(`${rn}assets/atlas-slots.json`).json();
const photoCount = compact.length / 6;
if (slotsJson.slots.length !== photoCount) fail('slots and photos differ in count');
const rgb = new Uint8Array(photoCount * 3);
const lab = new Int16Array(photoCount * 3);
for (let i = 0; i < photoCount; i++) {
  for (let k = 0; k < 3; k++) {
    const c = compact[i * 6 + k];
    if (!Number.isInteger(c) || c < 0 || c > 255) fail(`rgb ${i} ${c}`);
    rgb[i * 3 + k] = c;
    const l = compact[i * 6 + 3 + k];
    const q = Math.round(l * 100);
    if (q < -32768 || q > 32767 || q / 100 !== l) fail(`lab ${i} ${l} is not a 2-decimal i16`);
    lab[i * 3 + k] = q;
  }
}
for (let i = 0; i < photoCount; i++)
  for (let k = 0; k < 3; k++)
    if (rgb[i * 3 + k] !== compact[i * 6 + k] || lab[i * 3 + k] / 100 !== compact[i * 6 + 3 + k])
      fail(`photos-compact round trip ${i}`);
console.log(`photos-compact.json: ${photoCount} photos, 60000 numbers round-trip as u8 + i16/100`);

// ---- the JSON RN never loads ----
{
  const manifest: { photos: { id: number; rgb: { r: number; g: number; b: number } }[] } =
    await Bun.file(`${rn}assets/photos-manifest.json`).json();
  const same = manifest.photos.every(
    (p, i) => p.id === i && p.rgb.r === rgb[i * 3] && p.rgb.g === rgb[i * 3 + 1] && p.rgb.b === rgb[i * 3 + 2],
  );
  const info: { photoSize: number; cols: number; photos: { id: number; x: number; y: number }[] } =
    await Bun.file(`${rn}assets/atlas-info.json`).json();
  const grid = info.photos.every(
    (p, i) => p.id === i && p.x === (i % info.cols) * info.photoSize && p.y === Math.floor(i / info.cols) * info.photoSize,
  );
  console.log(
    `photos-manifest.json (not loaded by RN): rgb equal to photos-compact's: ${same}; atlas-info.json (not loaded by RN): a plain ${info.cols}-column grid of ${info.photoSize} px: ${grid}`,
  );
}

// ---- the painting decode: Skia's codec ----
const CanvasKitInit = (await import(`${NM}canvaskit-wasm/bin/full/canvaskit.js`)).default;
const CK = await CanvasKitInit({ locateFile: (f: string) => `${NM}canvaskit-wasm/bin/full/${f}` });

function stripIcc(b: Uint8Array): Uint8Array {
  const parts = [b.subarray(0, 2)];
  let o = 2;
  while (o < b.length) {
    const m = b[o + 1];
    if (m === 0xda) {
      parts.push(b.subarray(o));
      break;
    }
    const len = (b[o + 2] << 8) | b[o + 3];
    const seg = b.subarray(o, o + 2 + len);
    if (!(m === 0xe2 && String.fromCharCode(...seg.subarray(4, 15)) === 'ICC_PROFILE')) parts.push(seg);
    o += 2 + len;
  }
  const r = new Uint8Array(parts.reduce((n, s) => n + s.length, 0));
  let k = 0;
  for (const s of parts) {
    r.set(s, k);
    k += s.length;
  }
  return r;
}

function decode(path: string): { w: number; h: number; pixels: Uint8Array } {
  const img = CK.MakeImageFromEncoded(stripIcc(new Uint8Array(require('fs').readFileSync(path))));
  const w = img.width();
  const h = img.height();
  const pixels = img.readPixels(0, 0, {
    width: w,
    height: h,
    colorType: CK.ColorType.RGBA_8888,
    alphaType: CK.AlphaType.Unpremul,
    colorSpace: CK.ColorSpace.SRGB,
  }) as Uint8Array;
  img.delete();
  // libjpeg-turbo's own decoder, as a second witness.
  const ppm = Bun.spawnSync(['djpeg', '-dct', 'int', '-pnm', path]).stdout;
  let o = 0;
  for (let nl = 0; nl < 3; ) if (ppm[o++] === 10) nl++;
  for (let i = 0; i < w * h; i++)
    for (let k = 0; k < 3; k++) if (pixels[i * 4 + k] !== ppm[o + i * 3 + k]) fail(`${path}: CanvasKit and djpeg differ`);
  return { w, h, pixels };
}

// use-painting-analysis.ts sampleRegionFromBuffer, verbatim.
const sampleRegionFromBuffer = (
  data: Uint8Array,
  imageWidth: number,
  regionX: number,
  regionY: number,
  regionWidth: number,
  regionHeight: number,
) => {
  const bytesPerPixel = 4;
  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;
  const step = 2;
  const startX = Math.floor(regionX);
  const startY = Math.floor(regionY);
  const endX = Math.min(startX + Math.floor(regionWidth), imageWidth);
  const endY = startY + Math.floor(regionHeight);
  for (let y = startY; y < endY; y += step) {
    for (let x = startX; x < endX; x += step) {
      const idx = (y * imageWidth + x) * bytesPerPixel;
      if (idx + 3 < data.length) {
        totalR += data[idx];
        totalG += data[idx + 1];
        totalB += data[idx + 2];
        count++;
      }
    }
  }
  if (count === 0) return { r: 128, g: 128, b: 128 };
  return { r: Math.round(totalR / count), g: Math.round(totalG / count), b: Math.round(totalB / count) };
};

// ---- RN's matcher, compiled ----
const tmp = mkdtempSync(join(tmpdir(), 'art-gallery-'));
const cpp = (await Bun.file(`${root}legacy/src/native/ColorMatcher/HybridColorMatcher.cpp`).text()).replace(
  'std::thread::hardware_concurrency()',
  'ag_threads()',
);
if (!cpp.includes('ag_threads()')) fail('hardware_concurrency not found in the matcher');
// A pure black cell's L is −1.8e-15 (116 × 16 / 116 − 16), so getBucket gives −1 and RN pushes
// the cell onto cellBuckets[−1], 24 bytes before the array: undefined behaviour. When the heap
// survives it (RN's usual case) the cell sits in no bucket the loop reads and stays unmatched,
// so RN draws no tile there. The copy here drops such a cell (and such a photo) instead of
// writing out of bounds: the same result, without the crash.
const guarded = cpp
  .replace('cellBuckets[getBucket(cellLAB[i].l)].push_back(i);', 'if (getBucket(cellLAB[i].l) >= 0) cellBuckets[getBucket(cellLAB[i].l)].push_back(i);')
  .replace('photoBuckets[getBucket(photoLAB[pi].l)].push_back(pi);', 'if (getBucket(photoLAB[pi].l) >= 0) photoBuckets[getBucket(photoLAB[pi].l)].push_back(pi);');
if ((guarded.match(/>= 0\) (cell|photo)Buckets/g) ?? []).length !== 2) fail('getBucket call sites not found');
writeFileSync(join(tmp, 'matcher-rn.cpp'), guarded);
writeFileSync(join(tmp, 'HybridColorMatcher.hpp'), '#pragma once\n');
const exe = join(tmp, 'matcher');
const cc = Bun.spawnSync(['clang++', '-std=c++17', '-O2', '-I', tmp, '-o', exe, `${import.meta.dir}/matcher-harness.cpp`]);
if (cc.exitCode !== 0) fail(`clang++: ${cc.stderr}`);

const RUNS = 24;
const modeReport: string[] = [];
function match(cellRGB: number[], cellIndices: number[], threads: number): Map<number, number> | null {
  const n = cellIndices.length;
  const input = new ArrayBuffer(8 + 8 * (n * 4 + photoCount * 4));
  const head = new Uint32Array(input, 0, 2);
  head[0] = n;
  head[1] = photoCount;
  const f = new Float64Array(input, 8);
  f.set(cellRGB, 0);
  f.set(cellIndices, n * 3);
  for (let i = 0; i < photoCount * 3; i++) f[n * 4 + i] = rgb[i];
  for (let i = 0; i < photoCount; i++) f[n * 4 + photoCount * 3 + i] = i;
  const r = Bun.spawnSync([exe], { stdin: new Uint8Array(input), env: { AG_THREADS: String(threads) } });
  if (r.exitCode !== 0) return null;
  const pairs = new Float64Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.byteLength / 8);
  // index.ts matchColorsNative: Map.set over the pairs.
  const m = new Map<number, number>();
  for (let i = 0; i < pairs.length; i += 2) m.set(pairs[i], pairs[i + 1]);
  return m;
}

// ---- the paintings ----
type Painting = { id: string; asset: { default: string } | string };
const paintings: Painting[] = ART_MOVEMENTS.flatMap((m: any) => m.painters.flatMap((p: any) => p.paintings));
const files = new Set(readdirSync(`${rn}paintings`));
const chunks: Uint8Array[] = [];
const u16 = (vals: number[]) => new Uint8Array(new Uint16Array(vals).buffer);
chunks.push(u16([photoCount, slotsJson.rows, slotsJson.cols, paintings.length]));
chunks.push(u16(slotsJson.slots));
const expected: { id: string; w: number; h: number; cols: number; rows: number; ids: number[] }[] = [];
let empty = 0;
for (const p of paintings) {
  const path = typeof p.asset === 'string' ? p.asset : p.asset.default;
  files.delete(path.split('/').pop()!);
  const { w, h, pixels } = decode(path);
  // analyzeImage.
  const aspectRatio = w / h;
  const rows = Math.round(Math.sqrt(TARGET_CELLS / aspectRatio));
  const cols = Math.round(rows * aspectRatio);
  const totalCells = cols * rows;
  const cellWidth = w / cols;
  const cellHeight = h / rows;
  const cellRGB: number[] = [];
  const cellIndices: number[] = [];
  for (let i = 0; i < totalCells; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const c = sampleRegionFromBuffer(pixels, w, col * cellWidth, row * cellHeight, cellWidth, cellHeight);
    cellRGB.push(c.r, c.g, c.b);
    cellIndices.push(i);
  }
  // RN's matcher races (see the header): run it as an iPhone's 6 threads RUNS times and keep
  // the result it gives most often. A run whose race corrupted the heap (exit != 0) is retried.
  const seen = new Map<string, { n: number; mapping: Map<number, number> }>();
  let runs = 0;
  for (let tries = 0; runs < RUNS && tries < RUNS * 3; tries++) {
    const m = match(cellRGB, cellIndices, 6);
    if (!m) continue;
    runs++;
    const key = cellIndices.map(i => m.get(i) ?? -1).join(',');
    const e = seen.get(key);
    if (e) e.n++;
    else seen.set(key, { n: 1, mapping: m });
  }
  if (runs < RUNS) fail(`${p.id}: the matcher crashed too often`);
  const modes = [...seen.values()].sort((a, b) => b.n - a.n);
  const mapping = modes[0].mapping;
  const serial = match(cellRGB, cellIndices, 1) ?? fail(`${p.id}: the serial matcher crashed`);
  const differ = (a: Map<number, number>, b: Map<number, number>) => cellIndices.filter(i => a.get(i) !== b.get(i)).length;
  modeReport.push(
    `${p.id}: ${modes.length} result(s) in ${runs} runs, kept ${modes[0].n}/${runs}` +
      (modes.length > 1 ? ` (others ${modes.slice(1).map(m => `${m.n}× ${differ(m.mapping, mapping)} cells off`).join(', ')})` : '') +
      `; one thread: ${differ(serial, mapping)} cells off`,
  );
  const ids = cellIndices.map(i => mapping.get(i) ?? 0xffff);
  empty += ids.filter(v => v === 0xffff).length;
  expected.push({ id: p.id, w, h, cols, rows, ids });
  const name = new TextEncoder().encode(p.id);
  chunks.push(new Uint8Array([name.length]), name);
  chunks.push(u16([w, h, cols, rows]), u16(ids));
  console.log(`${p.id}: ${w}×${h} → ${cols}×${rows}, ${mapping.size} matched`);
}
if (files.size) fail(`paintings not in paintings.ts: ${[...files]}`);
rmSync(tmp, { recursive: true });

const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
let at = 0;
for (const c of chunks) {
  bytes.set(c, at);
  at += c.length;
}
await Bun.write(out, bytes);

// ---- read it back as the Rust surface does ----
{
  const dv = new DataView(bytes.buffer);
  let o = 0;
  const r16 = () => {
    const v = dv.getUint16(o, true);
    o += 2;
    return v;
  };
  if (r16() !== photoCount || r16() !== slotsJson.rows || r16() !== slotsJson.cols || r16() !== paintings.length)
    fail('header');
  for (let i = 0; i < photoCount; i++) if (r16() !== slotsJson.slots[i]) fail(`slot ${i}`);
  for (const e of expected) {
    const n = bytes[o++];
    const id = new TextDecoder().decode(bytes.subarray(o, o + n));
    o += n;
    if (id !== e.id || r16() !== e.w || r16() !== e.h || r16() !== e.cols || r16() !== e.rows) fail(`${e.id} header`);
    for (let i = 0; i < e.cols * e.rows; i++) if (r16() !== e.ids[i]) fail(`${e.id} cell ${i}`);
  }
  if (o !== bytes.length) fail('trailing bytes');
}
for (const l of modeReport) console.log(l);
console.log(`${out}: ${bytes.length} bytes, verified (${empty} cells left empty by the matcher)`);

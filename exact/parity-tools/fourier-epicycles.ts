// The fourier-visualizer pipeline as RN runs it, on Skia (CanvasKit) and fft.js themselves: a
// stroke's path through toSVGString / MakeFromSVGString, ContourMeasure's length and
// getPosTan samples (getPoints), fillToPowerOfTwo, fft.js's transform, extractEpicycles sorted
// by amplitude. It prints what gpu/src/fourier_visualizer.rs's test asserts for the same stroke.
//
//   bun exact/parity-tools/fourier-epicycles.ts
//
// The stroke: the test's (`stroke()` there), as the Pan writes it: moveTo(p0) + lineTo(p0) at
// onStart, lineTo(p0) at the onChange of the same event, then one lineTo per move.
import FFT from '../../node_modules/fft.js/lib/fft.js';
import CanvasKitInit from '../../node_modules/canvaskit-wasm/bin/canvaskit.js';

const bin = new URL('../../node_modules/canvaskit-wasm/bin/', import.meta.url).pathname;
const CK = await CanvasKitInit({ locateFile: (f: string) => bin + f });

const stroke: [number, number][] = [];
for (let k = 0; k < 120; k++) {
  // A rational loop (no trig, so every engine computes the same floats).
  const s = (k - 60) / 25;
  const x = 200 + (120 * (1 - s * s)) / (1 + s * s) + 0.37 * k;
  const y = 450 + (90 * 2 * s) / (1 + s * s);
  stroke.push([Math.fround(x), Math.fround(y)]);
}
const b = new CK.PathBuilder();
b.moveTo(...stroke[0]);
b.lineTo(...stroke[0]);
b.lineTo(...stroke[0]);
for (const p of stroke.slice(1)) b.lineTo(...p);
const svg = b.snapshot().toSVGString();
const path = CK.Path.MakeFromSVGString(svg)!;

const it = new CK.ContourMeasureIter(path, false, 1);
const contour = it.next()!;
const totalLength = contour.length();
const amount = Math.round(totalLength);
const points: { x: number; y: number }[] = [];
for (let i = 0; i < amount; i++) {
  const [x, y] = contour.getPosTan((i / amount) * totalLength);
  points.push({ x, y });
}
// fillToPowerOfTwo (nextPowerOfTwo as the demo writes it).
let n = points.length, count = 0;
if (n && (n & (n - 1)) !== 0) while (n !== 0) { n >>= 1; count += 1; }
const filled = Array(1 << count).fill(points[points.length - 1]);
for (let i = 0; i < points.length; i++) filled[i] = points[i];
const N = filled.length;
const fft = new FFT(N);
const input = new Array(N * 2).fill(0), output = new Array(N * 2).fill(0);
for (let i = 0; i < N; i++) { input[2 * i] = filled[i].x; input[2 * i + 1] = filled[i].y; }
fft.transform(output, input);
const epicycles = [];
for (let i = 0; i < N; i++) {
  const j = i % 2 === 0 ? i / 2 : N - (i + 1) / 2;
  const x = output[2 * j], y = output[2 * j + 1];
  epicycles.push({ frequency: ((j + N / 2) % N) - N / 2, amplitude: Math.sqrt(x * x + y * y) / N, phase: Math.atan2(y, x) });
}
epicycles.sort((a, b) => b.amplitude - a.amplitude);
let sumX = 0, sumY = 0;
for (const p of points) { sumX += p.x; sumY += p.y; }
console.log(JSON.stringify({ svg: svg.slice(0, 80), totalLength, amount, N, sumX, sumY, points: points.slice(0, 3).concat(points.slice(-1)), epicycles: epicycles.slice(0, 4) }, null, 1));

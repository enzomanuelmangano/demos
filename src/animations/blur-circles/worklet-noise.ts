import { buildPermutationTable } from 'simplex-noise';

// simplex-noise's createNoise2D, split so the noise can be evaluated in a
// worklet. The permutation table is still built once on the JS thread, with
// the same random shuffle; the tables are plain arrays so the UI runtime can
// copy them. The arithmetic below is the library's, line for line.

const F2 = 0.5 * (Math.sqrt(3.0) - 1.0);
const G2 = (3.0 - Math.sqrt(3.0)) / 6.0;

const GRAD2 = [
  1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0,
  -1,
];

export type NoiseTables = {
  perm: number[];
  gradX: number[];
  gradY: number[];
};

export const createNoiseTables = (
  random: () => number = Math.random,
): NoiseTables => {
  const perm = Array.from(buildPermutationTable(random));
  return {
    perm,
    gradX: perm.map(v => GRAD2[(v % 12) * 2]),
    gradY: perm.map(v => GRAD2[(v % 12) * 2 + 1]),
  };
};

export const noise2D = (tables: NoiseTables, x: number, y: number) => {
  'worklet';
  const { perm, gradX, gradY } = tables;
  let n0 = 0;
  let n1 = 0;
  let n2 = 0;
  const s = (x + y) * F2;
  const i = Math.floor(x + s) | 0;
  const j = Math.floor(y + s) | 0;
  const t = (i + j) * G2;
  const x0 = x - (i - t);
  const y0 = y - (j - t);
  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2;
  const y1 = y0 - j1 + G2;
  const x2 = x0 - 1.0 + 2.0 * G2;
  const y2 = y0 - 1.0 + 2.0 * G2;
  const ii = i & 255;
  const jj = j & 255;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 >= 0) {
    const gi0 = ii + perm[jj];
    t0 *= t0;
    n0 = t0 * t0 * (gradX[gi0] * x0 + gradY[gi0] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 >= 0) {
    const gi1 = ii + i1 + perm[jj + j1];
    t1 *= t1;
    n1 = t1 * t1 * (gradX[gi1] * x1 + gradY[gi1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 >= 0) {
    const gi2 = ii + 1 + perm[jj + 1];
    t2 *= t2;
    n2 = t2 * t2 * (gradX[gi2] * x2 + gradY[gi2] * y2);
  }
  return 70.0 * (n0 + n1 + n2);
};

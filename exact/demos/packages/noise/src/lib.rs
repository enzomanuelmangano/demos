//! simplex-noise 4.0.3 (node_modules/simplex-noise/dist/esm/simplex-noise.js): the permutation
//! table `buildPermutationTable(random)` shuffles, and `createNoise2D`'s noise over it.

#![deny(missing_docs)]

const F2: f64 = 0.366_025_403_784_438_6; // 0.5 * (sqrt(3) - 1)
const G2: f64 = 0.211_324_865_405_187_1; // (3 - sqrt(3)) / 6
const GRAD2: [f64; 24] = [1., 1., -1., 1., 1., -1., -1., -1., 1., 0., -1., 0., 1., 0., -1., 0., 0., 1., 0., -1., 0., 1., 0., -1.];

/// A 2D simplex noise field (`createNoise2D(random)`).
#[derive(Clone, Debug)]
pub struct Noise2D {
    perm: [u8; 512],
    grad_x: [f64; 512],
    grad_y: [f64; 512],
}

impl Noise2D {
    /// The field `random` (Math.random's stand-in, 0…1) shuffles.
    pub fn new(mut random: impl FnMut() -> f64) -> Noise2D {
        let mut perm = [0u8; 512];
        for (i, p) in perm.iter_mut().take(256).enumerate() {
            *p = i as u8;
        }
        for i in 0..255 {
            let r = i + (random() * (256 - i) as f64) as usize;
            perm.swap(i, r);
        }
        for i in 256..512 {
            perm[i] = perm[i - 256];
        }
        let mut grad_x = [0.0; 512];
        let mut grad_y = [0.0; 512];
        for i in 0..512 {
            grad_x[i] = GRAD2[(perm[i] as usize % 12) * 2];
            grad_y[i] = GRAD2[(perm[i] as usize % 12) * 2 + 1];
        }
        Noise2D { perm, grad_x, grad_y }
    }

    /// The noise at (x, y), in −1…1.
    pub fn at(&self, x: f64, y: f64) -> f64 {
        let (mut n0, mut n1, mut n2) = (0.0, 0.0, 0.0);
        let s = (x + y) * F2;
        let i = (x + s).floor() as i64;
        let j = (y + s).floor() as i64;
        let t = (i + j) as f64 * G2;
        let x0 = x - (i as f64 - t);
        let y0 = y - (j as f64 - t);
        let (i1, j1) = if x0 > y0 { (1, 0) } else { (0, 1) };
        let x1 = x0 - i1 as f64 + G2;
        let y1 = y0 - j1 as f64 + G2;
        let x2 = x0 - 1.0 + 2.0 * G2;
        let y2 = y0 - 1.0 + 2.0 * G2;
        let ii = (i & 255) as usize;
        let jj = (j & 255) as usize;
        let mut t0 = 0.5 - x0 * x0 - y0 * y0;
        if t0 >= 0.0 {
            let g = ii + self.perm[jj] as usize;
            t0 *= t0;
            n0 = t0 * t0 * (self.grad_x[g] * x0 + self.grad_y[g] * y0);
        }
        let mut t1 = 0.5 - x1 * x1 - y1 * y1;
        if t1 >= 0.0 {
            let g = ii + i1 + self.perm[jj + j1] as usize;
            t1 *= t1;
            n1 = t1 * t1 * (self.grad_x[g] * x1 + self.grad_y[g] * y1);
        }
        let mut t2 = 0.5 - x2 * x2 - y2 * y2;
        if t2 >= 0.0 {
            let g = ii + 1 + self.perm[jj + 1] as usize;
            t2 *= t2;
            n2 = t2 * t2 * (self.grad_x[g] * x2 + self.grad_y[g] * y2);
        }
        70.0 * (n0 + n1 + n2)
    }
}

/// Math.random for a surface: xorshift64*, seeded once (e.g. from the host clock's bits).
#[derive(Clone, Debug)]
pub struct Random(u64);

impl Random {
    /// Seeded; a zero seed is replaced.
    pub fn new(seed: u64) -> Random {
        Random(seed.max(1).wrapping_mul(0x9E37_79B9_7F4A_7C15) | 1)
    }
    /// The next number in 0…1.
    pub fn next(&mut self) -> f64 {
        let mut x = self.0;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.0 = x;
        (x.wrapping_mul(0x2545_F491_4F6C_DD1D) >> 11) as f64 / (1u64 << 53) as f64
    }
}

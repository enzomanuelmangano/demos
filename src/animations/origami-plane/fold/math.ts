// Minimal vec3 / quaternion / mat4 helpers for the origami fold engine.
// Tuples keep allocations cheap; mat4 is column-major (WebGPU convention).

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number]; // x, y, z, w
export type Mat4 = Float32Array; // length 16, column-major

export const v3 = {
  add: (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
  sub: (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  scale: (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s],
  dot: (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ],
  len: (a: Vec3): number => Math.hypot(a[0], a[1], a[2]),
  normalize: (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  },
  lerp: (a: Vec3, b: Vec3, t: number): Vec3 => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ],
};

export const quat = {
  identity: (): Quat => [0, 0, 0, 1],

  // Quaternion for a rotation of `angle` radians about a unit `axis`.
  fromAxisAngle: (axis: Vec3, angle: number): Quat => {
    const h = angle * 0.5;
    const s = Math.sin(h);
    return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(h)];
  },

  // Hamilton product a * b (apply b first, then a).
  mul: (a: Quat, b: Quat): Quat => {
    const [ax, ay, az, aw] = a;
    const [bx, by, bz, bw] = b;
    return [
      aw * bx + ax * bw + ay * bz - az * by,
      aw * by - ax * bz + ay * bw + az * bx,
      aw * bz + ax * by - ay * bx + az * bw,
      aw * bw - ax * bx - ay * by - az * bz,
    ];
  },

  rotate: (q: Quat, v: Vec3): Vec3 => {
    const [x, y, z, w] = q;
    // t = 2 * cross(q.xyz, v)
    const tx = 2 * (y * v[2] - z * v[1]);
    const ty = 2 * (z * v[0] - x * v[2]);
    const tz = 2 * (x * v[1] - y * v[0]);
    // v + w * t + cross(q.xyz, t)
    return [
      v[0] + w * tx + (y * tz - z * ty),
      v[1] + w * ty + (z * tx - x * tz),
      v[2] + w * tz + (x * ty - y * tx),
    ];
  },

  slerp: (a: Quat, b: Quat, t: number): Quat => {
    let [bx, by, bz, bw] = b;
    let cos = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
    // Take the shorter arc.
    if (cos < 0) {
      cos = -cos;
      bx = -bx;
      by = -by;
      bz = -bz;
      bw = -bw;
    }
    if (cos > 0.9995) {
      // Nearly parallel — linear blend + renormalize.
      const r: Quat = [
        a[0] + (bx - a[0]) * t,
        a[1] + (by - a[1]) * t,
        a[2] + (bz - a[2]) * t,
        a[3] + (bw - a[3]) * t,
      ];
      const l = Math.hypot(r[0], r[1], r[2], r[3]) || 1;
      return [r[0] / l, r[1] / l, r[2] / l, r[3] / l];
    }
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    const wa = Math.sin((1 - t) * theta) / sin;
    const wb = Math.sin(t * theta) / sin;
    return [
      a[0] * wa + bx * wb,
      a[1] * wa + by * wb,
      a[2] * wa + bz * wb,
      a[3] * wa + bw * wb,
    ];
  },
};

// Rigid transform: world = rot(q, rest) + t.
export interface Transform {
  q: Quat;
  t: Vec3;
}

export const transform = {
  identity: (): Transform => ({ q: quat.identity(), t: [0, 0, 0] }),

  apply: (tr: Transform, v: Vec3): Vec3 => v3.add(quat.rotate(tr.q, v), tr.t),

  // Compose a world-space rotation (about a line through `p`, unit dir `d`,
  // by `angle`) on top of an existing transform.
  rotateAboutLine: (
    tr: Transform,
    p: Vec3,
    d: Vec3,
    angle: number,
  ): Transform => {
    const qr = quat.fromAxisAngle(d, angle);
    return {
      q: quat.mul(qr, tr.q),
      t: v3.add(quat.rotate(qr, v3.sub(tr.t, p)), p),
    };
  },

  lerp: (a: Transform, b: Transform, f: number): Transform => ({
    q: quat.slerp(a.q, b.q, f),
    t: v3.lerp(a.t, b.t, f),
  }),
};

// --- Camera matrices (column-major, depth range 0..1) ---

export const mat4 = {
  perspectiveZO: (
    fovy: number,
    aspect: number,
    near: number,
    far: number,
  ): Mat4 => {
    const f = 1 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = far * nf;
    m[11] = -1;
    m[14] = near * far * nf;
    return m;
  },

  orthoZO: (
    left: number,
    right: number,
    bottom: number,
    top: number,
    near: number,
    far: number,
  ): Mat4 => {
    const m = new Float32Array(16);
    m[0] = 2 / (right - left);
    m[5] = 2 / (top - bottom);
    m[10] = 1 / (near - far);
    m[12] = (right + left) / (left - right);
    m[13] = (top + bottom) / (bottom - top);
    m[14] = near / (near - far);
    m[15] = 1;
    return m;
  },

  lookAt: (eye: Vec3, center: Vec3, up: Vec3): Mat4 => {
    const z = v3.normalize(v3.sub(eye, center));
    const x = v3.normalize(v3.cross(up, z));
    const y = v3.cross(z, x);
    const m = new Float32Array(16);
    m[0] = x[0];
    m[1] = y[0];
    m[2] = z[0];
    m[4] = x[1];
    m[5] = y[1];
    m[6] = z[1];
    m[8] = x[2];
    m[9] = y[2];
    m[10] = z[2];
    m[12] = -v3.dot(x, eye);
    m[13] = -v3.dot(y, eye);
    m[14] = -v3.dot(z, eye);
    m[15] = 1;
    return m;
  },

  multiply: (a: Mat4, b: Mat4): Mat4 => {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        out[c * 4 + r] =
          a[r] * b[c * 4] +
          a[4 + r] * b[c * 4 + 1] +
          a[8 + r] * b[c * 4 + 2] +
          a[12 + r] * b[c * 4 + 3];
      }
    }
    return out;
  },
};

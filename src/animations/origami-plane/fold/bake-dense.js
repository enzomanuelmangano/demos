// Offline baker: generate dense, isometric in-between frames between each baked
// keyframe using a position-based distance solver (PBD).
//
// Idea: paper is inextensible. Between two keyframes the straight lerp crushes
// edges ~100%. Instead, march from A to B in N sub-steps; each sub-step nudge the
// moving vertices toward B, then run distance-constraint projection that restores
// every edge to its rest (flat) length while the crease/static vertices stay
// pinned. Pull-toward-B picks the fold direction; the constraints force the flap
// to ROTATE about the pinned crease instead of translating through itself.

const fs = require('fs');
const path = require('path');

const SRC =
  '/Users/enzomanuelmangano/Desktop/Work/reactiive/thank-you/src/animations/origami-plane/fold/crane-frames.json';
const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const F = data.frames;
const TRIS = data.tris;
const NV = data.nV;
const NF = F.length;

// --- unique edges + rest lengths (flat frame 0) ---
const eMap = new Map();
for (const t of TRIS) {
  const pairs = [
    [t[0], t[1]],
    [t[1], t[2]],
    [t[2], t[0]],
  ];
  for (let [a, b] of pairs) {
    if (a > b) [a, b] = [b, a];
    eMap.set(a + '_' + b, [a, b]);
  }
}
const EDGES = [...eMap.values()];
const REST = EDGES.map(([a, b]) => dist(F[0], a, b));

function dist(fr, a, b) {
  const ka = a * 3,
    kb = b * 3;
  return Math.hypot(fr[ka] - fr[kb], fr[ka + 1] - fr[kb + 1], fr[ka + 2] - fr[kb + 2]);
}

// max edge deviation of a flat position array vs rest
function isoErr(pos) {
  let mx = 0;
  for (let e = 0; e < EDGES.length; e++) {
    const [a, b] = EDGES[e];
    const d = Math.hypot(
      pos[a * 3] - pos[b * 3],
      pos[a * 3 + 1] - pos[b * 3 + 1],
      pos[a * 3 + 2] - pos[b * 3 + 2],
    );
    const dev = Math.abs(d - REST[e]) / (REST[e] || 1);
    if (dev > mx) mx = dev;
  }
  return mx;
}

const SUB = 10; // sub-frames per transition (output)
const MARCH = 60; // internal march steps (finer than output for stability)
const ITER = 90; // PBD iterations per march step
const ALPHA = 0.06; // gentle pull-toward-B (proven isometric, no yank-through)

// --- exact rigid rotation (Horn) for steps that ARE a single rotation ---
function rotAxis(x, y, z, ax, ay, az, ang) {
  const c = Math.cos(ang),
    s = Math.sin(ang),
    dt = x * ax + y * ay + z * az;
  const cx = ay * z - az * y,
    cy = az * x - ax * z,
    cz = ax * y - ay * x;
  return [
    x * c + cx * s + ax * dt * (1 - c),
    y * c + cy * s + ay * dt * (1 - c),
    z * c + cz * s + az * dt * (1 - c),
  ];
}
function solve3(c0, c1, c2, tx, ty, tz) {
  const det =
    c0[0] * (c1[1] * c2[2] - c1[2] * c2[1]) -
    c1[0] * (c0[1] * c2[2] - c0[2] * c2[1]) +
    c2[0] * (c0[1] * c1[2] - c0[2] * c1[1]);
  if (Math.abs(det) < 1e-6) return null;
  const id = 1 / det;
  const dx =
    tx * (c1[1] * c2[2] - c1[2] * c2[1]) -
    c1[0] * (ty * c2[2] - tz * c2[1]) +
    c2[0] * (ty * c1[2] - tz * c1[1]);
  const dy =
    c0[0] * (ty * c2[2] - tz * c2[1]) -
    tx * (c0[1] * c2[2] - c0[2] * c2[1]) +
    c2[0] * (c0[1] * tz - c0[2] * ty);
  const dz =
    c0[0] * (c1[1] * tz - c1[2] * ty) -
    c1[0] * (c0[1] * tz - c0[2] * ty) +
    tx * (c0[1] * c1[2] - c0[2] * c1[1]);
  return [dx * id, dy * id, dz * id];
}
// Returns {moving, ax,ay,az,angle,px,py,pz,res} for the single best rotation a→b.
function fitRotation(A, B) {
  const moving = [];
  let cax = 0,
    cay = 0,
    caz = 0,
    cbx = 0,
    cby = 0,
    cbz = 0;
  for (let i = 0; i < NV; i++) {
    const k = i * 3;
    const d = Math.hypot(B[k] - A[k], B[k + 1] - A[k + 1], B[k + 2] - A[k + 2]);
    if (d > 0.02) {
      moving.push(i);
      cax += A[k];
      cay += A[k + 1];
      caz += A[k + 2];
      cbx += B[k];
      cby += B[k + 1];
      cbz += B[k + 2];
    }
  }
  const n = moving.length;
  if (n < 3) return null;
  cax /= n; cay /= n; caz /= n; cbx /= n; cby /= n; cbz /= n; // prettier-ignore
  const H = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const i of moving) {
    const k = i * 3;
    const px = A[k] - cax, py = A[k + 1] - cay, pz = A[k + 2] - caz; // prettier-ignore
    const qx = B[k] - cbx, qy = B[k + 1] - cby, qz = B[k + 2] - cbz; // prettier-ignore
    H[0] += px * qx; H[1] += px * qy; H[2] += px * qz; // prettier-ignore
    H[3] += py * qx; H[4] += py * qy; H[5] += py * qz; // prettier-ignore
    H[6] += pz * qx; H[7] += pz * qy; H[8] += pz * qz; // prettier-ignore
  }
  const [Sxx, Sxy, Sxz, Syx, Syy, Syz, Szx, Szy, Szz] = H;
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  let shift = 1;
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) shift += Math.abs(N[r][c]); // prettier-ignore
  for (let r = 0; r < 4; r++) N[r][r] += shift;
  let v = [1, 0.3, 0.3, 0.3];
  for (let it = 0; it < 80; it++) {
    const nv = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) nv[r] = N[r][0] * v[0] + N[r][1] * v[1] + N[r][2] * v[2] + N[r][3] * v[3]; // prettier-ignore
    const L = Math.hypot(nv[0], nv[1], nv[2], nv[3]) || 1;
    v = [nv[0] / L, nv[1] / L, nv[2] / L, nv[3] / L];
  }
  let [qw, qx, qy, qz] = v;
  if (qw < 0) { qw = -qw; qx = -qx; qy = -qy; qz = -qz; } // prettier-ignore
  const angle = 2 * Math.acos(Math.max(-1, Math.min(1, qw)));
  const sh = Math.sqrt(Math.max(0, 1 - qw * qw)) || 1;
  const ax = qx / sh, ay = qy / sh, az = qz / sh; // prettier-ignore
  let res = 0;
  for (const i of moving) {
    const k = i * 3;
    const r = rotAxis(A[k] - cax, A[k + 1] - cay, A[k + 2] - caz, ax, ay, az, angle);
    res += Math.hypot(r[0] + cbx - B[k], r[1] + cby - B[k + 1], r[2] + cbz - B[k + 2]);
  }
  res /= n;
  if (angle < 0.05) return null;
  const rca = rotAxis(cax, cay, caz, ax, ay, az, angle);
  const tx = cbx - rca[0], ty = cby - rca[1], tz = cbz - rca[2]; // prettier-ignore
  const col = (ex, ey, ez) => {
    const r = rotAxis(ex, ey, ez, ax, ay, az, angle);
    const d = ax * ex + ay * ey + az * ez;
    return [ex - r[0] + ax * d, ey - r[1] + ay * d, ez - r[2] + az * d];
  };
  const pivot = solve3(col(1, 0, 0), col(0, 1, 0), col(0, 0, 1), tx, ty, tz);
  if (!pivot) return null;
  const mset = new Uint8Array(NV);
  for (const i of moving) mset[i] = 1;
  return { mset, ax, ay, az, angle, px: pivot[0], py: pivot[1], pz: pivot[2], res };
}

function bakeTransition(A, B) {
  // If the whole step is a single rigid rotation (clean fit), generate exact
  // rotation sub-frames — a perfect, 0%-stretch fold arc (book folds, wing folds).
  const fit = fitRotation(A, B);
  if (fit && fit.res < 0.06) {
    const out = [];
    let maxErr = 0;
    for (let s = 1; s <= SUB; s++) {
      if (s === SUB) {
        out.push(B.slice());
        break;
      }
      const f = s / SUB;
      const pos = A.slice();
      for (let v = 0; v < NV; v++) {
        if (!fit.mset[v]) continue;
        const k = v * 3;
        const r = rotAxis(
          A[k] - fit.px,
          A[k + 1] - fit.py,
          A[k + 2] - fit.pz,
          fit.ax,
          fit.ay,
          fit.az,
          fit.angle * f,
        );
        pos[k] = r[0] + fit.px;
        pos[k + 1] = r[1] + fit.py;
        pos[k + 2] = r[2] + fit.pz;
      }
      const e = isoErr(pos);
      if (e > maxErr) maxErr = e;
      out.push(pos);
    }
    // Only trust exact rotation if it's genuinely isometric end-to-end; else the
    // fit was a false positive (multi-flap step) → fall through to the PBD solver.
    if (maxErr < 0.03) return out;
  }

  // anchored = vertices that don't move A->B (the static sheet incl. crease)
  const anchored = new Uint8Array(NV);
  for (let v = 0; v < NV; v++) {
    const k = v * 3;
    const d = Math.hypot(B[k] - A[k], B[k + 1] - A[k + 1], B[k + 2] - A[k + 2]);
    if (d < 0.02) anchored[v] = 1;
  }
  const pos = A.slice();
  const traj = [A.slice()];
  for (let s = 1; s <= MARCH; s++) {
    // Gentle pull toward B (proven isometric — flap rolls, doesn't yank through).
    for (let v = 0; v < NV; v++) {
      if (anchored[v]) continue;
      const k = v * 3;
      pos[k] += (B[k] - pos[k]) * ALPHA;
      pos[k + 1] += (B[k + 1] - pos[k + 1]) * ALPHA;
      pos[k + 2] += (B[k + 2] - pos[k + 2]) * ALPHA;
    }
    // PBD distance constraints — restore every edge to rest length
    for (let it = 0; it < ITER; it++) {
      for (let e = 0; e < EDGES.length; e++) {
        const [a, b] = EDGES[e];
        const ka = a * 3,
          kb = b * 3;
        let dx = pos[kb] - pos[ka],
          dy = pos[kb + 1] - pos[ka + 1],
          dz = pos[kb + 2] - pos[ka + 2];
        const L = Math.hypot(dx, dy, dz) || 1e-6;
        const diff = (L - REST[e]) / L;
        const aw = anchored[a] ? 0 : 1;
        const bw = anchored[b] ? 0 : 1;
        const w = aw + bw;
        if (w === 0) continue;
        const cx = dx * diff,
          cy = dy * diff,
          cz = dz * diff;
        if (aw) {
          pos[ka] += (cx * aw) / w;
          pos[ka + 1] += (cy * aw) / w;
          pos[ka + 2] += (cz * aw) / w;
        }
        if (bw) {
          pos[kb] -= (cx * bw) / w;
          pos[kb + 1] -= (cy * bw) / w;
          pos[kb + 2] -= (cz * bw) / w;
        }
      }
    }
    traj.push(pos.slice());
  }
  traj[traj.length - 1] = B.slice(); // snap converged end exactly to baked B

  // Resample by UNIFORM arc length → constant playback speed. The march frames
  // are dense and isometric, so interpolating between adjacent ones stays
  // isometric. This removes the ease/lag of the tracker → consistent motion.
  const cum = [0];
  for (let s = 1; s < traj.length; s++) {
    let d = 0;
    const p = traj[s];
    const q = traj[s - 1];
    for (let v = 0; v < NV; v++) {
      const k = v * 3;
      d += Math.hypot(p[k] - q[k], p[k + 1] - q[k + 1], p[k + 2] - q[k + 2]);
    }
    cum.push(cum[s - 1] + d);
  }
  const total = cum[cum.length - 1] || 1;
  const out = [];
  for (let j = 1; j <= SUB; j++) {
    if (j === SUB) {
      out.push(B.slice());
      break;
    }
    const targetArc = (j / SUB) * total;
    // pick the NEAREST march frame by arc length (no lerp → stays isometric)
    let s = 1;
    while (s < cum.length - 1 && cum[s] < targetArc) s++;
    if (s > 1 && targetArc - cum[s - 1] < cum[s] - targetArc) s -= 1;
    out.push(traj[s].slice());
  }
  return out;
}

const dense = [F[0].slice()];
const denseDescs = [data.descs[0]];
let worst = 0;
for (let i = 0; i < NF - 1; i++) {
  const sub = bakeTransition(F[i], F[i + 1]);
  for (let s = 0; s < sub.length; s++) {
    dense.push(sub[s]);
    denseDescs.push(data.descs[i + 1]);
    const e = isoErr(sub[s]);
    if (e > worst) worst = e;
  }
}

// report isometry of generated dense frames
let perStepWorst = [];
{
  let idx = 1;
  for (let i = 0; i < NF - 1; i++) {
    let mx = 0;
    for (let s = 0; s < SUB; s++) {
      const e = isoErr(dense[idx++]);
      if (e > mx) mx = e;
    }
    perStepWorst.push(Math.round(mx * 100));
  }
}
console.log('dense frames:', dense.length, '(was', NF, ')');
console.log('worst edge deviation across ALL dense frames:', (worst * 100).toFixed(1) + '%');
console.log('per-step worst mid-fold deviation %:', perStepWorst.join(' '));

const outData = {
  ...data,
  frames: dense,
  descs: data.descs, // keep the original 25 step labels (one per UI step)
  subPerStep: SUB,
};
void denseDescs;
const OUT =
  '/Users/enzomanuelmangano/Desktop/Work/reactiive/thank-you/src/animations/origami-plane/fold/crane-frames-dense.json';
fs.writeFileSync(OUT, JSON.stringify(outData));
console.log('wrote', OUT, (fs.statSync(OUT).size / 1024).toFixed(0) + 'KB');

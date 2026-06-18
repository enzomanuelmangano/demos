// Origami spring solver (à la Ghassaei's Origami Simulator).
//
// The crease pattern is triangulated into a mesh of rigid triangles. Springs:
//  - axial springs on every triangle edge keep the paper from stretching;
//  - crease constraints drive each fold edge's dihedral angle toward a target
//    (mountain = -π, valley = +π) scaled by the global fold fraction;
//  - facet (triangulation diagonal) creases hold each polygon flat (target 0).
// Integrating these to equilibrium folds the flat square into the model.

import cp from './crane-cp.json';

const AXIAL_K = 20; // edge stretch stiffness
const CREASE_K = 0.7; // fold-angle stiffness
const FACET_K = 0.7; // keep-flat stiffness
const DAMP = 0.9;
const DT = 0.012;
const MIN_H = 0.05; // clamp triangle height to tame the 1/h crease term
const MAX_F = 6; // clamp per-node force magnitude for stability

interface CreaseEntry {
  a: number; // crease edge endpoints
  b: number;
  c: number; // apex of face 1
  d: number; // apex of face 2
  k: number; // stiffness
  signedTarget: number; // ±π for M/V, 0 for facet; scaled by foldPct
  folds: boolean; // true for M/V creases (scaled by foldPct), false for facets
}

export interface OrigamiMesh {
  n: number;
  pos: Float32Array; // 3 * n
  vel: Float32Array;
  force: Float32Array;
  rest: Float32Array; // flat reference
  axA: Int32Array;
  axB: Int32Array;
  axRest: Float32Array;
  creases: CreaseEntry[];
  tris: Int32Array; // 3 * T
  triCount: number;
}

const key = (i: number, j: number) => (i < j ? i * 100000 + j : j * 100000 + i);

export const buildMesh = (): OrigamiMesh => {
  const coords = cp.vertices_coords as number[][];
  const edgesV = cp.edges_vertices as number[][];
  const edgesA = cp.edges_assignment as string[];
  const faces = cp.faces_vertices as number[][];

  const n = coords.length;
  const pos = new Float32Array(3 * n);
  const rest = new Float32Array(3 * n);
  // Centre the unit square, place in XZ, tiny deterministic y so the sheet
  // buckles into 3D instead of staying flat.
  const SCALE = 1.6;
  for (let i = 0; i < n; i++) {
    const x = (coords[i][0] - 0.5) * SCALE;
    const z = (coords[i][1] - 0.5) * SCALE;
    const y = Math.sin(i * 12.9898) * 0.5 * 0.02; // pseudo-random small lift
    rest[i * 3] = x;
    rest[i * 3 + 1] = y;
    rest[i * 3 + 2] = z;
  }
  pos.set(rest);

  // Original edge assignment lookup.
  const assign = new Map<number, string>();
  edgesV.forEach((e, i) => assign.set(key(e[0], e[1]), edgesA[i]));

  // Triangulate faces (fan); collect triangles + all edges (orig + diagonals).
  const tris: number[] = [];
  const axialSet = new Map<number, [number, number]>();
  // edge -> opposite apex vertices (for crease adjacency)
  const edgeApex = new Map<number, number[]>();

  const addEdge = (i: number, j: number) => {
    axialSet.set(key(i, j), [i, j]);
  };

  for (const face of faces) {
    for (let t = 1; t < face.length - 1; t++) {
      const a = face[0];
      const b = face[t];
      const c = face[t + 1];
      tris.push(a, b, c);
      // record apex per edge
      const tri = [a, b, c];
      for (let e = 0; e < 3; e++) {
        const i = tri[e];
        const j = tri[(e + 1) % 3];
        const apex = tri[(e + 2) % 3];
        addEdge(i, j);
        const k = key(i, j);
        if (!edgeApex.has(k)) edgeApex.set(k, []);
        edgeApex.get(k)!.push(apex);
      }
    }
  }

  // Axial springs.
  const axA: number[] = [];
  const axB: number[] = [];
  const axRest: number[] = [];
  const dist = (i: number, j: number) => {
    const dx = rest[i * 3] - rest[j * 3];
    const dy = rest[i * 3 + 1] - rest[j * 3 + 1];
    const dz = rest[i * 3 + 2] - rest[j * 3 + 2];
    return Math.hypot(dx, dy, dz);
  };
  for (const [, [i, j]] of axialSet) {
    axA.push(i);
    axB.push(j);
    axRest.push(dist(i, j));
  }

  // Crease constraints: interior edges shared by exactly two triangles.
  const creases: CreaseEntry[] = [];
  for (const [k, [i, j]] of axialSet) {
    const apexes = edgeApex.get(k)!;
    if (apexes.length !== 2) continue; // boundary edge → no crease
    const a = assign.get(k); // undefined ⇒ triangulation diagonal (facet)
    if (a === 'B') continue;
    const isFold = a === 'M' || a === 'V';
    const target = a === 'M' ? -Math.PI : a === 'V' ? Math.PI : 0;
    creases.push({
      a: i,
      b: j,
      c: apexes[0],
      d: apexes[1],
      k: isFold ? CREASE_K : FACET_K,
      signedTarget: target,
      folds: isFold,
    });
  }

  return {
    n,
    pos,
    vel: new Float32Array(3 * n),
    force: new Float32Array(3 * n),
    rest,
    axA: Int32Array.from(axA),
    axB: Int32Array.from(axB),
    axRest: Float32Array.from(axRest),
    creases,
    tris: Int32Array.from(tris),
    triCount: tris.length / 3,
  };
};

// --- vector helpers on the flat pos array ---
const sub = (p: Float32Array, i: number, j: number, o: number[]) => {
  o[0] = p[i * 3] - p[j * 3];
  o[1] = p[i * 3 + 1] - p[j * 3 + 1];
  o[2] = p[i * 3 + 2] - p[j * 3 + 2];
};
const cross = (a: number[], b: number[], o: number[]) => {
  o[0] = a[1] * b[2] - a[2] * b[1];
  o[1] = a[2] * b[0] - a[0] * b[2];
  o[2] = a[0] * b[1] - a[1] * b[0];
};
const dot = (a: number[], b: number[]) =>
  a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: number[]) => Math.hypot(a[0], a[1], a[2]);

const tmp = {
  ab: [0, 0, 0],
  ac: [0, 0, 0],
  ad: [0, 0, 0],
  bc: [0, 0, 0],
  bd: [0, 0, 0],
  n1: [0, 0, 0],
  n2: [0, 0, 0],
  cr: [0, 0, 0],
};

const addF = (f: Float32Array, i: number, x: number, y: number, z: number) => {
  f[i * 3] += x;
  f[i * 3 + 1] += y;
  f[i * 3 + 2] += z;
};

export const step = (m: OrigamiMesh, foldPct: number, substeps: number) => {
  const { pos, vel, force, axA, axB, axRest, creases } = m;
  for (let s = 0; s < substeps; s++) {
    force.fill(0);

    // Axial springs.
    for (let e = 0; e < axA.length; e++) {
      const i = axA[e];
      const j = axB[e];
      let dx = pos[j * 3] - pos[i * 3];
      let dy = pos[j * 3 + 1] - pos[i * 3 + 1];
      let dz = pos[j * 3 + 2] - pos[i * 3 + 2];
      const L = Math.hypot(dx, dy, dz) || 1e-6;
      const f = (AXIAL_K * (L - axRest[e])) / L;
      dx *= f;
      dy *= f;
      dz *= f;
      addF(force, i, dx, dy, dz);
      addF(force, j, -dx, -dy, -dz);
    }

    // Crease dihedral constraints.
    for (let ci = 0; ci < creases.length; ci++) {
      const cr = creases[ci];
      const { a, b, c, d } = cr;
      sub(pos, b, a, tmp.ab);
      sub(pos, c, a, tmp.ac);
      sub(pos, d, a, tmp.ad);
      sub(pos, c, b, tmp.bc);
      sub(pos, d, b, tmp.bd);
      cross(tmp.ab, tmp.ac, tmp.n1); // face1 normal (a,b,c)
      cross(tmp.ad, tmp.ab, tmp.n2); // face2 normal (a,d,b)
      const n1l = len(tmp.n1);
      const n2l = len(tmp.n2);
      if (n1l < 1e-7 || n2l < 1e-7) continue;
      const lab = len(tmp.ab) || 1e-6;
      const area1 = n1l / 2;
      const area2 = n2l / 2;
      const h1 = Math.max((2 * area1) / lab, MIN_H);
      const h2 = Math.max((2 * area2) / lab, MIN_H);
      // unit normals
      const n1x = tmp.n1[0] / n1l;
      const n1y = tmp.n1[1] / n1l;
      const n1z = tmp.n1[2] / n1l;
      const n2x = tmp.n2[0] / n2l;
      const n2y = tmp.n2[1] / n2l;
      const n2z = tmp.n2[2] / n2l;
      // dihedral angle
      let cosT = n1x * n2x + n1y * n2y + n1z * n2z;
      cosT = Math.max(-1, Math.min(1, cosT));
      cross([n1x, n1y, n1z], [n2x, n2y, n2z], tmp.cr);
      const sinT =
        (tmp.cr[0] * tmp.ab[0] +
          tmp.cr[1] * tmp.ab[1] +
          tmp.cr[2] * tmp.ab[2]) /
        lab;
      const theta = Math.atan2(sinT, cosT);
      const target = cr.folds ? cr.signedTarget * foldPct : 0;
      const coef = cr.k * (theta - target);

      // cotangents of the base angles in each face
      const cot = (u: number[], v: number[]) => {
        cross(u, v, tmp.cr);
        const cl = len(tmp.cr) || 1e-6;
        return dot(u, v) / cl;
      };
      const cotA1 = cot(tmp.ab, tmp.ac); // angle at a, face1
      const bcN = [-tmp.ab[0], -tmp.ab[1], -tmp.ab[2]];
      const cotB1 = cot(bcN, tmp.bc); // angle at b, face1
      const cotA2 = cot(tmp.ab, tmp.ad); // angle at a, face2
      const cotB2 = cot(bcN, tmp.bd); // angle at b, face2
      const s1 = cotA1 + cotB1 || 1e-6;
      const s2 = cotA2 + cotB2 || 1e-6;

      // dθ/dp contributions
      const n1h1 = [n1x / h1, n1y / h1, n1z / h1];
      const n2h2 = [n2x / h2, n2y / h2, n2z / h2];
      addF(force, c, coef * n1h1[0], coef * n1h1[1], coef * n1h1[2]);
      addF(force, d, coef * n2h2[0], coef * n2h2[1], coef * n2h2[2]);
      const wa1 = cotB1 / s1;
      const wb1 = cotA1 / s1;
      const wa2 = cotB2 / s2;
      const wb2 = cotA2 / s2;
      addF(
        force,
        a,
        coef * (-wa1 * n1h1[0] - wa2 * n2h2[0]),
        coef * (-wa1 * n1h1[1] - wa2 * n2h2[1]),
        coef * (-wa1 * n1h1[2] - wa2 * n2h2[2]),
      );
      addF(
        force,
        b,
        coef * (-wb1 * n1h1[0] - wb2 * n2h2[0]),
        coef * (-wb1 * n1h1[1] - wb2 * n2h2[1]),
        coef * (-wb1 * n1h1[2] - wb2 * n2h2[2]),
      );
    }

    // Integrate (semi-implicit Euler + damping), clamping per-node force.
    for (let v = 0; v < m.n; v++) {
      let fx = force[v * 3];
      let fy = force[v * 3 + 1];
      let fz = force[v * 3 + 2];
      const fl = Math.hypot(fx, fy, fz);
      if (fl > MAX_F) {
        const s2 = MAX_F / fl;
        fx *= s2;
        fy *= s2;
        fz *= s2;
      }
      const ix = v * 3;
      vel[ix] = (vel[ix] + DT * fx) * DAMP;
      vel[ix + 1] = (vel[ix + 1] + DT * fy) * DAMP;
      vel[ix + 2] = (vel[ix + 2] + DT * fz) * DAMP;
      pos[ix] += DT * vel[ix];
      pos[ix + 1] += DT * vel[ix + 1];
      pos[ix + 2] += DT * vel[ix + 2];
    }
  }
};

export const resetMesh = (m: OrigamiMesh) => {
  m.pos.set(m.rest);
  m.vel.fill(0);
};

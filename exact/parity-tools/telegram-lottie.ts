// telegram-theme-switch: the one-layer Lottie file RN plays (src/animations/telegram-theme-switch/
// assets/switch-theme.json) as Rust tables for the surface's evaluator, so no number is copied by
// hand. It asserts every assumption the evaluator makes (one shape layer, static transforms but the
// ones it animates, nonzero fills, no hold keyframes) and fails loudly if the file breaks one.
//
//   bun ../parity-tools/telegram-lottie.ts           (from exact/demos) writes gpu/src/telegram_lottie.rs
//   bun ../parity-tools/telegram-lottie.ts --check   exits 1 if the committed file differs
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dir, '../..');
const source = 'src/animations/telegram-theme-switch/assets/switch-theme.json';
const out = resolve(root, 'exact/demos/gpu/src/telegram_lottie.rs');
const d = JSON.parse(readFileSync(resolve(root, source), 'utf8'));

const fail = (what: string): never => {
  throw new Error(`${source}: ${what}`);
};
const check = (ok: boolean, what: string) => ok || fail(what);
const fixed = (prop: any, what: string) => {
  check(prop && prop.a === 0, `${what} is animated`);
  return prop.k;
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const f = (n: number) => {
  const s = String(n);
  return /[.e]/.test(s) ? s : `${s}.0`;
};
const pair = (v: number[]) => `[${f(v[0])}, ${f(v[1])}]`;
const pairs = (vs: number[][]) => `[${vs.map(pair).join(', ')}]`;

check(d.layers.length === 1 && (d.assets ?? []).length === 0, 'not one layer');
check(d.ip === 0, 'ip is not 0');
const layer = d.layers[0];
check(layer.ty === 4 && layer.nm === 'Layer 1/icons Outlines', 'not the shape layer RN filters');
check(layer.ip === d.ip && layer.op === d.op && layer.st === 0 && layer.sr === 1 && layer.ddd === 0, 'layer timing');
const lks = layer.ks;
check(fixed(lks.o, 'layer opacity') === 100 && fixed(lks.r, 'layer rotation') === 0, 'layer opacity / rotation');
const layerP = fixed(lks.p, 'layer position');
const layerA = fixed(lks.a, 'layer anchor');
const layerS = fixed(lks.s, 'layer scale');

/** A group's items: its paths, one nonzero fill at full opacity, and its transform last. */
const groupParts = (g: any) => {
  check(g.ty === 'gr' && !g.hd, `${g.nm}: not a visible group`);
  const tr = g.it[g.it.length - 1];
  check(tr.ty === 'tr', `${g.nm}: no transform last`);
  check(fixed(tr.sk, 'skew') === 0 && fixed(tr.sa, 'skew axis') === 0, `${g.nm}: skewed`);
  const fills = g.it.filter((i: any) => i.ty === 'fl');
  for (const fl of fills) {
    check(fl.r === 1 && fixed(fl.o, 'fill opacity') === 100 && !fl.hd, `${g.nm}: fill not nonzero / opaque`);
  }
  return { tr, items: g.it.slice(0, -1) };
};

const keyframes = (prop: any, what: string, dims: number) => {
  check(prop.a === 1, `${what} is not animated`);
  const k = prop.k;
  check(k.length === 2, `${what}: not two keyframes`);
  check(!k[0].h, `${what}: hold keyframe`);
  const tangent = (t: any, axis: 'x' | 'y') => {
    const v = t[axis];
    if (Array.isArray(v)) {
      check(v.every((c: number) => c === v[0]), `${what}: per-dimension tangents differ`);
      return v[0];
    }
    return v;
  };
  const value = (s: number[]) => {
    check(s.length >= dims, `${what}: value`);
    return dims === 1 ? f(s[0]) : pair(s);
  };
  return `Keyframe { t: ${f(k[0].t)}, o: [${f(tangent(k[0].o, 'x'))}, ${f(tangent(k[0].o, 'y'))}], i: [${f(tangent(k[0].i, 'x'))}, ${f(tangent(k[0].i, 'y'))}], from: ${value(k[0].s)}, t1: ${f(k[1].t)}, to: ${value(k[1].s)} }`;
};

check(layer.shapes.length === 2, 'not two top-level groups');
const [rays, body] = layer.shapes;

// Group 12: the eight rays, under an animated scale, rotation and opacity.
const raysParts = groupParts(rays);
const rtr = raysParts.tr;
const raysP = fixed(rtr.p, 'rays position');
const raysA = fixed(rtr.a, 'rays anchor');
const rayItems = raysParts.items;
check(rayItems.length === 8, 'not eight rays');
const rayRows = rayItems.map((g: any) => {
  const { tr, items } = groupParts(g);
  check(eq(fixed(tr.a, 'ray anchor'), [0, 0]) && eq(fixed(tr.s, 'ray scale'), [100, 100]), `${g.nm}: transform`);
  check(fixed(tr.r, 'ray rotation') === 0 && fixed(tr.o, 'ray opacity') === 100, `${g.nm}: transform`);
  check(items.length === 2 && items[0].ty === 'sh' && items[1].ty === 'fl', `${g.nm}: not a path and a fill`);
  const shape = fixed(items[0].ks, `${g.nm} path`);
  check(shape.c === true && shape.v.length === 7, `${g.nm}: not a closed 7-vertex path`);
  return `    Ray { at: ${pair(fixed(tr.p, 'ray position'))}, v: ${pairs(shape.v)}, i: ${pairs(shape.i)}, o: ${pairs(shape.o)} },`;
});

// Group 11: the body, a two-keyframe morph under a static transform.
const bodyParts = groupParts(body);
const btr = bodyParts.tr;
check(fixed(btr.o, 'body opacity') === 100 && eq(fixed(btr.a, 'body anchor'), [0, 0]), 'body transform');
check(bodyParts.items.length === 2 && bodyParts.items[0].ty === 'sh' && bodyParts.items[1].ty === 'fl', 'body: not a path and a fill');
const morph = bodyParts.items[0].ks;
check(morph.a === 1 && morph.k.length === 2 && !morph.k[0].h, 'body: not a two-keyframe morph');
const [m0, m1] = morph.k;
const shapeOf = (kf: any) => {
  const s = kf.s[0];
  check(s.c === true && s.v.length === 4, 'body: not a closed 4-vertex path');
  return `Body { v: ${pairs(s.v)}, i: ${pairs(s.i)}, o: ${pairs(s.o)} }`;
};

const rust = `//! Generated by exact/parity-tools/telegram-lottie.ts from ${source}:
//! do not edit. Lottie ${d.v}, ${d.w} × ${d.h} at ${d.fr} fps, frames ${d.ip} → ${d.op}; one shape layer
//! ("${layer.nm}"): group "${rays.nm}" (eight rays under an animated scale, rotation and
//! opacity) over group "${body.nm}" (a two-keyframe morph). Lottie tangents are relative to their
//! vertex; a keyframe eases from its out tangent \`o\` to the next one's in tangent \`i\`.

/// One eased segment from \`from\` at frame \`t\` to \`to\` at \`t1\`.
#[derive(Clone, Copy, Debug)]
pub struct Keyframe<T> {
    /// The segment's start frame.
    pub t: f64,
    /// Its out tangent (x, y).
    pub o: [f64; 2],
    /// The next keyframe's in tangent (x, y).
    pub i: [f64; 2],
    /// The value at \`t\`.
    pub from: T,
    /// The end frame.
    pub t1: f64,
    /// The value at \`t1\`.
    pub to: T,
}

/// A ray: its group's position and its closed path.
#[derive(Clone, Copy, Debug)]
pub struct Ray {
    /// The sub-group's position.
    pub at: [f64; 2],
    /// Vertices.
    pub v: [[f64; 2]; 7],
    /// In tangents.
    pub i: [[f64; 2]; 7],
    /// Out tangents.
    pub o: [[f64; 2]; 7],
}

/// The body's closed path at one keyframe.
#[derive(Clone, Copy, Debug)]
pub struct Body {
    /// Vertices.
    pub v: [[f64; 2]; 4],
    /// In tangents.
    pub i: [[f64; 2]; 4],
    /// Out tangents.
    pub o: [[f64; 2]; 4],
}

/// The composition's size.
pub const COMP: [f64; 2] = ${pair([d.w, d.h])};
/// Its end frame (\`op\`): progress 1.
pub const END_FRAME: f64 = ${f(d.op)};
/// The layer's position.
pub const LAYER_P: [f64; 2] = ${pair(layerP)};
/// The layer's anchor.
pub const LAYER_A: [f64; 2] = ${pair(layerA)};
/// The layer's scale (%).
pub const LAYER_S: [f64; 2] = ${pair(layerS)};
/// The rays' group's position.
pub const RAYS_P: [f64; 2] = ${pair(raysP)};
/// The rays' group's anchor.
pub const RAYS_A: [f64; 2] = ${pair(raysA)};
/// The rays' group's scale (%).
pub const RAYS_SCALE: Keyframe<[f64; 2]> = ${keyframes(rtr.s, 'rays scale', 2)};
/// The rays' group's rotation (°).
pub const RAYS_ROTATION: Keyframe<f64> = ${keyframes(rtr.r, 'rays rotation', 1)};
/// The rays' group's opacity (%).
pub const RAYS_OPACITY: Keyframe<f64> = ${keyframes(rtr.o, 'rays opacity', 1)};
/// The rays, in the group's order.
pub const RAYS: [Ray; 8] = [
${rayRows.join('\n')}
];
/// The body's group's position.
pub const BODY_P: [f64; 2] = ${pair(fixed(btr.p, 'body position'))};
/// The body's group's scale (%).
pub const BODY_S: [f64; 2] = ${pair(fixed(btr.s, 'body scale'))};
/// The body's group's rotation (°).
pub const BODY_R: f64 = ${f(fixed(btr.r, 'body rotation'))};
/// The body's morph: frames, tangents, and its two shapes.
pub const BODY_MORPH: Keyframe<Body> = Keyframe { t: ${f(m0.t)}, o: [${f(m0.o.x)}, ${f(m0.o.y)}], i: [${f(m0.i.x)}, ${f(m0.i.y)}], from: ${shapeOf(m0)}, t1: ${f(m1.t)}, to: ${shapeOf(m1)} };
`;

if (process.argv.includes('--check')) {
  const committed = readFileSync(out, 'utf8');
  if (committed !== rust) {
    console.error(`${out} is stale: run without --check`);
    process.exit(1);
  }
  console.log('telegram_lottie.rs is current');
} else {
  writeFileSync(out, rust);
  console.log(`wrote ${out}`);
}

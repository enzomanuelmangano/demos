// The setup ghost and the dizzy birds: ghost-materials.ts' makeToonMaterial (the banded body,
// antialiased by fwidth) and makeVeilMaterial (the eyes, ported 1:1 out of Ghost_Fill_Veil:
// the outline ellipse, the lid band with rounded caps, the scowl, the catchlight disc), and
// dizzy-birds.ts' hard-banded toon and its inverted-hull contour. The morph targets are blended
// here, from a storage buffer, so the CPU writes only the weights. Colours are linear; the
// dissolve pass encodes.
struct Scene {
    view_proj: mat4x4<f32>,
    // The toon key (xyz), normalised.
    key: vec4<f32>,
    eye_dark: vec4<f32>,
    // The catchlight's colour (rgb); the contour's is `contour`.
    pupil: vec4<f32>,
    contour: vec4<f32>,
    // The head's centre in the veil mesh's units (xyz); whether the eyes show (w).
    head: vec4<f32>,
    // topArc, botArc, lidLift, capHalf
    lid: vec4<f32>,
    // cornerK, squint, eye edge softness, pupil squash
    lid2: vec4<f32>,
    // The eyes' frames, left then right: up, right, forward.
    eye_u0: vec4<f32>,
    eye_r0: vec4<f32>,
    eye_d0: vec4<f32>,
    eye_u1: vec4<f32>,
    eye_r1: vec4<f32>,
    eye_d1: vec4<f32>,
    // Per eye: radius, squash, catchlight radius, scowl.
    shape0: vec4<f32>,
    shape1: vec4<f32>,
    // The catchlights' offsets: left (xy), right (zw).
    pupil_at: vec4<f32>,
}

struct Draw {
    model: mat4x4<f32>,
    normal: mat4x4<f32>,
    // A flat colour, or the toon's lit band; its mid and shaded bands.
    lit: vec4<f32>,
    mid: vec4<f32>,
    shade: vec4<f32>,
    // x: 0 flat, 1 the ghost's toon, 2 the toon with the eyes, 3 a bird's toon, 4 the soft body;
    // y: morph targets; z: vertices; w: the contour's width, in mesh units.
    mode: vec4<f32>,
    // Up to 56 morph weights.
    weights: array<vec4<f32>, 14>,
}

@group(0) @binding(0) var<uniform> s: Scene;
@group(1) @binding(0) var<uniform> d: Draw;
// The morph displacements, target by target, three floats a vertex.
@group(1) @binding(1) var<storage, read> targets: array<f32>;

struct VertexIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
}

struct Varyings {
    @builtin(position) clip: vec4<f32>,
    @location(0) local: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
}

fn morphed(v: VertexIn, vi: u32) -> vec3<f32> {
    var p = v.position;
    let n = u32(d.mode.y);
    let count = u32(d.mode.z);
    for (var t = 0u; t < n; t = t + 1u) {
        let w = d.weights[t / 4u][t % 4u];
        if (w != 0.0) {
            let at = (t * count + vi) * 3u;
            p = p + w * vec3<f32>(targets[at], targets[at + 1u], targets[at + 2u]);
        }
    }
    return p;
}

fn place(p: vec3<f32>, n: vec3<f32>) -> Varyings {
    var out: Varyings;
    out.clip = s.view_proj * (d.model * vec4<f32>(p, 1.0));
    out.local = p;
    out.world_normal = (d.normal * vec4<f32>(n, 0.0)).xyz;
    return out;
}

@vertex
fn vs(v: VertexIn, @builtin(vertex_index) vi: u32) -> Varyings {
    return place(morphed(v, vi), v.normal);
}

// The inverted hull: pushed out along the normal by a fixed width, drawn from behind.
@vertex
fn vs_hull(v: VertexIn) -> Varyings {
    return place(v.position + v.normal * d.mode.w, v.normal);
}

@fragment
fn fs_hull() -> @location(0) vec4<f32> {
    return vec4<f32>(s.contour.rgb, 1.0);
}

// GLSL's smoothstep, which also runs with its edges reversed (TSL relies on it).
fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

const FROWN_TILT = 0.06;
const FROWN_DROP = 0.05;
const FROWN_LIFT = 0.025;
const HEMI_LO = 0.02;
const HEMI_HI = 0.12;
const GLINT_SOFT = 0.034851301;

struct EyeMask {
    eye: f32,
    glint: f32,
}

// One eye (ghost-materials.ts maskFor); `inner` is +1 on the left, -1 on the right.
fn eye_mask(nd: vec3<f32>, eu: vec3<f32>, er: vec3<f32>, ed: vec3<f32>, shape: vec4<f32>,
            pup: vec2<f32>, inner_sign: f32) -> EyeMask {
    let u = dot(nd, eu);
    let r = dot(nd, er);
    let hemi = ss(HEMI_LO, HEMI_HI, dot(nd, ed));
    let rad = shape.x;
    let sq = shape.y;
    let frown = shape.w;
    let inner = r * inner_sign;
    let ub = u;
    // The outline, unchanged at every aperture: |(r, u / sq)| < rad.
    let b0 = rad * sq;
    let hw = rad;
    let dn = length(vec2<f32>(abs(r) / hw, abs(ub) / b0));
    let d_outline = (dn - 1.0) * min(hw, b0);
    // The lid band: both edges on the oval's own profile.
    let q = sqrt(1.0 - clamp((r / hw) * (r / hw), 0.0, 1.0));
    let q_floor = max(q, 0.02);
    let slope = -(s.lid.y * r / (hw * hw)) / q_floor;
    let widen = min(sqrt(1.0 + slope * slope), 40.0);
    let scowl_drop = frown * (FROWN_DROP + inner / rad * FROWN_TILT);
    let top = (s.lid.x - s.lid2.y) * q + s.lid.z * widen - scowl_drop;
    let bot = (s.lid.y + s.lid2.y) * q + frown * FROWN_LIFT;
    let mid = (top + bot) * 0.5;
    let half_across = (top - bot) * 0.5 / widen;
    let across = (ub - mid) / widen;
    let beyond = max(abs(r) - s.lid.w, 0.0);
    let d_band = length(vec2<f32>(across, beyond)) - half_across;
    // Rounded intersection (Quilez).
    let k = s.lid2.x;
    let c = max(vec2<f32>(d_band + k, d_outline + k), vec2<f32>(0.0));
    let d_eye = min(max(d_band, d_outline), -k) + length(c);
    let eye = ss(0.0, -s.lid2.z, d_eye) * hemi;
    // The catchlight, occluded by the lid.
    let pd = length(vec2<f32>(r - pup.x, (u - pup.y) / s.lid2.w));
    let glint = ss(shape.z, shape.z * (1.0 - GLINT_SOFT), pd) * eye;
    return EyeMask(eye, glint);
}

// ghost-materials.ts makeSoftMaterial (the Home ghost, hero.rs): the toon's tones smoothstepped in
// wide overlapping windows, a cool rim from behind and above, a warm bounce from below. Y-up.
const RIM = vec3<f32>(-0.11957, 0.61778, -0.777207);
const RIM_TINT = vec3<f32>(0.502886, 0.658375, 0.871367);
const RIM_STRENGTH = 0.62;
const RIM_POWER = 2.6;
const BOUNCE_TINT = vec3<f32>(0.806952, 0.597202, 0.456411);
const BOUNCE_STRENGTH = 0.22;

fn soft(n: vec3<f32>, ndl: f32) -> vec3<f32> {
    let mid = mix(d.shade.rgb, d.mid.rgb, ss(0.0, 0.62, ndl));
    let body = mix(mid, d.lit.rgb, ss(0.42, 1.0, ndl));
    let rim = pow(clamp(dot(n, RIM), 0.0, 1.0), RIM_POWER);
    let bounce = pow(clamp(dot(n, vec3<f32>(0.0, -1.0, 0.0)), 0.0, 1.0), 1.6);
    return body + RIM_TINT * rim * RIM_STRENGTH + BOUNCE_TINT * bounce * BOUNCE_STRENGTH;
}

@fragment
fn fs(in: Varyings) -> @location(0) vec4<f32> {
    let mode = d.mode.x;
    let ndl = dot(normalize(in.world_normal), s.key.xyz);
    // Constant bands, antialiased: fwidth(t) is a one-pixel edge at screen resolution.
    let t = clamp(ndl, 0.0, 1.0);
    let w = max(fwidth(t) * 0.5, 0.0006);
    if (mode < 0.5) {
        return vec4<f32>(d.lit.rgb, 1.0);
    }
    if (mode > 3.5) {
        return vec4<f32>(soft(normalize(in.world_normal), t), 1.0);
    }
    if (mode > 2.5) {
        let bird = mix(mix(d.shade.rgb, d.mid.rgb, step(0.18, ndl)), d.lit.rgb, step(0.62, ndl));
        return vec4<f32>(bird, 1.0);
    }
    var banded = mix(d.shade.rgb, d.mid.rgb, ss(0.22 - w, 0.22 + w, t));
    banded = mix(banded, d.lit.rgb, ss(0.58 - w, 0.58 + w, t));
    if (mode < 1.5) {
        return vec4<f32>(banded, 1.0);
    }
    let nd = normalize(in.local - s.head.xyz);
    let a = eye_mask(nd, s.eye_u0.xyz, s.eye_r0.xyz, s.eye_d0.xyz, s.shape0, s.pupil_at.xy, 1.0);
    let b = eye_mask(nd, s.eye_u1.xyz, s.eye_r1.xyz, s.eye_d1.xyz, s.shape1, s.pupil_at.zw, -1.0);
    let eye = max(a.eye, b.eye) * s.head.w;
    let glint = max(a.glint, b.glint) * s.head.w;
    return vec4<f32>(mix(mix(banded, s.eye_dark.rgb, eye), s.pupil.rgb, glint), 1.0);
}

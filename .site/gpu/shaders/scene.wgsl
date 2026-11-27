// The intro's board and ghost: flat colours for the board, three toon bands
// for the ghost, and the eyes masked onto the veil — the RN scene's TSL
// materials (onboarding/ghost-scene-core.ts), written out. All colours are
// linear; the composite pass encodes.
struct Scene {
    view_proj: mat4x4<f32>,
    lit: vec4<f32>,
    mid: vec4<f32>,
    shade: vec4<f32>,
    eye_dark: vec4<f32>,
    pupil: vec4<f32>,
    // The toon key, normalised (xyz).
    key: vec4<f32>,
    eye_u0: vec4<f32>,
    eye_u1: vec4<f32>,
    eye_r0: vec4<f32>,
    eye_r1: vec4<f32>,
    // rad0, rad1, sq0, sq1
    eye: vec4<f32>,
    // glint centre of eye 0 (xy) and eye 1 (zw)
    glint_at: vec4<f32>,
    // glint radius 0, 1; frown 0, 1
    glint_frown: vec4<f32>,
    // aperture, aperture softness, lid curve, frown drop
    lid: vec4<f32>,
    // gate low, gate high, glint softness, eye edge softness
    misc: vec4<f32>,
    // The head's centre in the veil mesh's space (xyz) the eyes are aimed from, and
    // whether they show (w): the intro's ghost (0.04, 0.06, 0, 1); the offer's mascot
    // moves it per clip frame (ghost-materials.ts setHeadC, eyeShowAt).
    head: vec4<f32>,
}

struct Draw {
    model: mat4x4<f32>,
    normal: mat4x4<f32>,
    color: vec4<f32>,
    // x: 0 a flat colour, 1 the ghost's toon bands, 2 the bands with the eyes.
    // The colour's alpha is the material's opacity (three's NormalBlending).
    mode: vec4<f32>,
}

@group(0) @binding(0) var<uniform> s: Scene;
@group(1) @binding(0) var<uniform> d: Draw;

struct VertexIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
}

struct Varyings {
    @builtin(position) clip: vec4<f32>,
    @location(0) local: vec3<f32>,
    @location(1) world_normal: vec3<f32>,
}

@vertex
fn vs(v: VertexIn) -> Varyings {
    var out: Varyings;
    let world = d.model * vec4<f32>(v.position, 1.0);
    out.clip = s.view_proj * world;
    out.local = v.position;
    out.world_normal = (d.normal * vec4<f32>(v.normal, 0.0)).xyz;
    return out;
}

// GLSL's smoothstep, which also runs with its edges reversed (TSL relies on it).
fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

const FROWN_TILT = 0.3;
const GLINT_SQ = 1.155;

struct EyeMask {
    eye: f32,
    glint: f32,
}

fn eye_mask(local: vec3<f32>, eu: vec3<f32>, er: vec3<f32>, rad: f32, sq: f32,
            glint_at: vec2<f32>, glint_r: f32, frown: f32, inner_sign: f32) -> EyeMask {
    let nd = normalize(local - s.head.xyz);
    let u = dot(nd, eu);
    let r = dot(nd, er);
    let hemi = ss(0.02, 0.12, dot(nd, cross(eu, er)));
    let dd = length(vec2<f32>(r, u / sq));
    let eye = ss(rad, rad - s.misc.w, dd);
    let inner = r * inner_sign;
    let al = u + r * r * s.lid.z + frown * inner * FROWN_TILT;
    let ap = s.lid.x - frown * s.lid.w;
    let soft = s.lid.y;
    let lid = ss(ap + soft, ap - soft, al) * ss(-ap - soft, -ap + soft, al);
    let mask = eye * lid * hemi;
    let gv = vec2<f32>(r, u) - glint_at;
    let gd = length(vec2<f32>(gv.x, gv.y / GLINT_SQ));
    let gate = ss(s.misc.x, s.misc.y, s.lid.x);
    let glint = ss(glint_r, glint_r * (1.0 - s.misc.z), gd) * mask * gate;
    return EyeMask(mask, glint);
}

@fragment
fn fs(in: Varyings) -> @location(0) vec4<f32> {
    let mode = d.mode.x;
    if (mode < 0.5) {
        return vec4<f32>(d.color.rgb, d.color.a);
    }
    let ndl = dot(normalize(in.world_normal), s.key.xyz);
    let banded = mix(mix(s.shade.rgb, s.mid.rgb, step(0.22, ndl)), s.lit.rgb, step(0.58, ndl));
    if (mode < 1.5) {
        return vec4<f32>(banded, d.color.a);
    }
    let e0 = eye_mask(in.local, s.eye_u0.xyz, s.eye_r0.xyz, s.eye.x, s.eye.z,
                      s.glint_at.xy, s.glint_frown.x, s.glint_frown.z, 1.0);
    let e1 = eye_mask(in.local, s.eye_u1.xyz, s.eye_r1.xyz, s.eye.y, s.eye.w,
                      s.glint_at.zw, s.glint_frown.y, s.glint_frown.w, -1.0);
    let with_eye = mix(banded, s.eye_dark.rgb, max(e0.eye, e1.eye) * s.head.w);
    return vec4<f32>(mix(with_eye, s.pupil.rgb, max(e0.glint, e1.glint) * s.head.w), d.color.a);
}

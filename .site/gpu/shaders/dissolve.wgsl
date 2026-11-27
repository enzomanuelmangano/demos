// The setup ghost's scene onto the canvas: three's output transform (linear to sRGB, encoded
// straight, then premultiplied), under the app's dissolve (src/components/ui/dissolve-mask.ts:
// a mask carrying smoothstep from `start` to `end` down the box, taking pixels away so the page
// shows through) and the 260 ms fade the RN Ghost plays once its first frame drew.
struct Dissolve {
    // start, end (fractions down the canvas), opacity, 1 when the target encodes sRGB itself
    fade: vec4<f32>,
}

@group(0) @binding(0) var<uniform> u: Dissolve;
@group(0) @binding(1) var scene: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

fn oetf(c: vec3<f32>) -> vec3<f32> {
    let lo = c * 12.92;
    let hi = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(hi, lo, c <= vec3<f32>(0.0031308));
}

fn eotf(c: vec3<f32>) -> vec3<f32> {
    let lo = c / 12.92;
    let hi = pow((max(c, vec3<f32>(0.0)) + 0.055) / 1.055, vec3<f32>(2.4));
    return select(hi, lo, c <= vec3<f32>(0.04045));
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let size = vec2<f32>(textureDimensions(scene));
    let sc = textureLoad(scene, vec2<i32>(pos.xy), 0);
    let mask = (1.0 - ss(u.fade.x, u.fade.y, pos.y / size.y)) * u.fade.z;
    let alpha = sc.a * mask;
    let straight = select(vec3<f32>(0.0), sc.rgb / max(sc.a, 1e-6), sc.a > 0.0);
    let encoded = oetf(min(straight, vec3<f32>(1.0))) * alpha;
    if (u.fade.w > 0.5) {
        return vec4<f32>(eotf(encoded), alpha);
    }
    return vec4<f32>(encoded, alpha);
}

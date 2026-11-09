// BottomBarSkia (src/animations/bottom-bar-skia): the tab bar's composite. `layer` is the white
// bar and its bump (a rect and a circle of r 50) blurred (Blur 5), whose ColorMatrix keeps white
// and maps alpha to 20 a − 10; `mask` is that shape blurred again by the canvas view's iOS
// shadow (shadowRadius 25, offset (0, −10), rgba(0, 0, 0, 0.2) at shadowOpacity 0.2); `top` is
// what the canvas draws over the layer (the purple circle, the icons), premultiplied.
// `layer` and `mask` are padded by `pad.x` pixels on every side, so the blur reads what lies
// past the canvas's edges as Skia's layer bounds do.
struct Uniforms {
    // The canvas (device pixels), whether the target encodes sRGB itself, unused.
    canvas: vec4<f32>,
    // The padding, the padded layer's size (pixels), the shadow's y offset (pixels).
    pad: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var layer: texture_2d<f32>;
@group(0) @binding(2) var mask: texture_2d<f32>;
@group(0) @binding(3) var top: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    o.uv = vec2<f32>(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
    return o;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

fn goo_at(uv: vec2<f32>) -> f32 {
    return clamp(20.0 * textureSampleLevel(layer, smp, uv, 0.0).a - 10.0, 0.0, 1.0);
}

// The thresholded shape, in the padded layer, kept to the canvas: the shadow's source is the
// view's own content.
@fragment
fn goo(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.pad.yz - vec2<f32>(u.pad.x);
    if (any(p < vec2<f32>(0.0)) || any(p > u.canvas.xy)) { return vec4<f32>(0.0); }
    let a = goo_at(in.uv);
    return vec4<f32>(a, a, a, a);
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy + vec2<f32>(u.pad.x);
    let a = goo_at(p / u.pad.yz);
    let shadow = 0.04 * textureSampleLevel(mask, smp, (p + vec2<f32>(0.0, u.pad.w)) / u.pad.yz, 0.0).a;
    // White over the shadow's black.
    let base = vec4<f32>(vec3<f32>(a), a + shadow * (1.0 - a));
    let t = textureLoad(top, vec2<i32>(in.pos.xy), 0);
    var trgb = t.rgb / max(t.a, 1e-5);
    if (u.canvas.z > 0.5) { trgb = to_linear(trgb); }
    return vec4<f32>(trgb * t.a + base.rgb * (1.0 - t.a), t.a + base.a * (1.0 - t.a));
}

// A Skia `<Group layer={<Paint><Blur blur={σ} /><ColorMatrix matrix={…, 0, 0, 0, k, b} /></Paint>}>`
// with what is drawn over it, composed (delete-button, exclusion-tabs). `goo` is the layer's Graphite
// blur (premultiplied, on its low-resolution grid, read bilinearly at `low`, transparent outside
// the blur's output `out`); the colour matrix runs per pixel on the unpremultiplied colour, keeps
// RGB and maps alpha to k·a + b (clamped), as SkColorFilters::Matrix does. `top` is what the
// canvas draws after the layer (premultiplied, the device's pixels), over it. Out: premultiplied,
// in the target's encoding.
struct Uniforms {
    // The blur: uv = p · low.xy + low.zw (device pixels).
    low: vec4<f32>,
    // The blur's output rect (ltrb, device pixels).
    out: vec4<f32>,
    // k, b, whether the target encodes sRGB itself (the shader writes linear), unused.
    matrix: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var goo: texture_2d<f32>;
@group(0) @binding(2) var top: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    return o;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.pos.xy;
    var g = vec4<f32>(0.0);
    if (all(p >= u.out.xy) && all(p <= u.out.zw)) {
        g = textureSampleLevel(goo, smp, p * u.low.xy + u.low.zw, 0.0);
    }
    let rgb = g.rgb / max(g.a, 1e-5);
    let a = clamp(u.matrix.x * g.a + u.matrix.y, 0.0, 1.0);
    // Skia blends in the canvas's encoded space: `top` (premultiplied) over the filtered layer.
    let t = textureLoad(top, vec2<i32>(p), 0);
    var c = vec4<f32>(t.rgb + rgb * a * (1.0 - t.a), t.a + a * (1.0 - t.a));
    if (u.matrix.z > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}

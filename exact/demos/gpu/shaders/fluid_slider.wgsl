// Fluid Slider (src/animations/fluid-slider): the canvas's two parts, composed. `goo` is the
// layer of the bar and the metaball (#007AFF) blurred (Blur 4) and put through the layer's
// ColorMatrix, which keeps the colour and maps alpha to 50 a − 25 (unpremultiplied, as Skia's
// colour filters run); `top` is what is drawn over the layer (the white circle and the value),
// premultiplied. Out: premultiplied, in the target's encoding.
struct Uniforms {
    // Whether the target encodes sRGB itself (the shader writes linear), unused ×3.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var goo: texture_2d<f32>;
@group(0) @binding(2) var top: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let g = textureSampleLevel(goo, smp, in.uv, 0.0);
    var rgb = g.rgb / max(g.a, 1e-5);
    let a = clamp(50.0 * g.a - 25.0, 0.0, 1.0);
    let t = textureLoad(top, vec2<i32>(in.pos.xy), 0);
    var trgb = t.rgb / max(t.a, 1e-5);
    if (u.canvas.x > 0.5) {
        rgb = to_linear(rgb);
        trgb = to_linear(trgb);
    }
    return vec4<f32>(trgb * t.a + rgb * a * (1.0 - t.a), t.a + a * (1.0 - t.a));
}

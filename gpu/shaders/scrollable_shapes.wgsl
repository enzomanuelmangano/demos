// Scrollable Shapes (src/animations/scrollable-shapes): the screen composed. Black (the
// container's), the static glow canvas (a circle with a radial gradient #ffffff40 → transparent
// under Blur 60: its Graphite blur on the low-resolution grid, read bilinearly at `low`,
// transparent outside the blur's output `out`), then the points canvas (`points`,
// premultiplied), then the paginator's dots (`dots`, premultiplied). Out: opaque, in the
// target's encoding.
struct Uniforms {
    // The blur: uv = p · low.xy + low.zw (device pixels).
    low: vec4<f32>,
    // The blur's output rect (ltrb, device pixels).
    out: vec4<f32>,
    // Whether the target encodes sRGB itself (the shader writes linear), unused ×3.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var glow: texture_2d<f32>;
@group(0) @binding(2) var points: texture_2d<f32>;
@group(0) @binding(3) var dots: texture_2d<f32>;
@group(0) @binding(4) var smp: sampler;

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

fn over(top: vec4<f32>, under: vec4<f32>) -> vec4<f32> {
    return top + under * (1.0 - top.a);
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.pos.xy;
    let q = vec2<i32>(p);
    var c = vec4<f32>(0.0, 0.0, 0.0, 1.0);
    if (all(p >= u.out.xy) && all(p <= u.out.zw)) {
        c = over(textureSampleLevel(glow, smp, p * u.low.xy + u.low.zw, 0.0), c);
    }
    c = over(textureLoad(points, q, 0), c);
    c = over(textureLoad(dots, q, 0), c);
    if (u.canvas.x > 0.5) {
        c = vec4<f32>(to_linear(c.rgb), 1.0);
    }
    return c;
}

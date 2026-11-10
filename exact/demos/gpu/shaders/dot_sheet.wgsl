// Dot Sheet (src/animations/dot-sheet/src/components/background-gradient.tsx): the blurred
// sweep gradient, drawn once into a layer and blurred there (skia's Blur, decal), put into the
// target as it is: premultiplied, transparent where the blur fades at the canvas's edges.
struct Uniforms {
    // Whether the target encodes sRGB itself (1); unused.
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var glow: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

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
    let c = textureSampleLevel(glow, smp, in.uv, 0.0);
    if (u.flags.x > 0.5 && c.a > 0.0) {
        return vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}

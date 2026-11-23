// Linear Sensors (src/animations/linear-sensors): the square group's layer before its drop
// shadow, in the 500² canvas's points (a 300² window of it from (100, 100)): the blurred
// gradient square (Blur 10) over the #101010 square, then <Shadow color="#4c4c4c" inner blur={0}
// dx={0} dy={0.8}>, RN Skia's inner shadow: the colour where the layer, moved down 0.8, is
// transparent, kept where the layer is (SrcOut, offset, SrcIn), over the layer.
struct Inner {
    // The shadow's offset in texture units (0.8 pt over 300 pt), unused.
    offset: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Inner;
@group(0) @binding(1) var square: texture_2d<f32>;
@group(0) @binding(2) var gradient: texture_2d<f32>;
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

fn layer(uv: vec2<f32>) -> vec4<f32> {
    if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) { return vec4<f32>(0.0); }
    let a = textureSampleLevel(square, smp, uv, 0.0);
    let g = textureSampleLevel(gradient, smp, uv, 0.0);
    return g + a * (1.0 - g.a);
}

@fragment
fn inner(in: Out) -> @location(0) vec4<f32> {
    let s = layer(in.uv);
    let k = (1.0 - layer(in.uv - u.offset.xy).a) * s.a;
    let shade = vec4<f32>(vec3<f32>(76.0 / 255.0) * k, k);
    return shade + s * (1.0 - k);
}

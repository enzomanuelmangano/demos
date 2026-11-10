// Light on Painting (src/animations/light-on-painting): the screen as Core Animation composites
// it. RN's canvas is a CAMetalLayer whose drawable is min(PixelRatio, 2) × its points
// (use-relight-renderer.ts MAX_PIXEL_RATIO), stretched over its bounds with the layer's linear
// filter: the relit layer (light_on_painting.wgsl, sRGB-encoded) sampled bilinearly at this
// pixel's centre, in its encoding. Over it, the Paginator's views (white, at their opacity:
// premultiplied, sRGB-encoded, drawn by packages/skia at the device's pixels), src-over.
struct Uniforms {
    // The target in device pixels (w, h); whether the target encodes sRGB itself (1); whether
    // the relit layer is the target's size (1: read texel for texel).
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var painting: texture_2d<f32>;
@group(0) @binding(2) var dots: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    var base: vec3<f32>;
    if (u.canvas.w > 0.5) {
        base = textureLoad(painting, vec2<i32>(floor(pos.xy)), 0).rgb;
    } else {
        base = textureSampleLevel(painting, smp, pos.xy / u.canvas.xy, 0.0).rgb;
    }
    let over = textureLoad(dots, vec2<i32>(floor(pos.xy)), 0);
    var c = over.rgb + base * (1.0 - over.a);
    if (u.canvas.z > 0.5) {
        c = to_linear(c);
    }
    return vec4<f32>(c, 1.0);
}

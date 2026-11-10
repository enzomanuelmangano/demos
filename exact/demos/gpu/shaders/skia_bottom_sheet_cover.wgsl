// Skia Bottom Sheet (src/animations/skia-bottom-sheet/index.tsx): the photo as
// `<Image x=0 y=0 width height fit="cover">` draws it, into a texture of the canvas's pixels:
// scaled to cover the canvas, centred (Skia's fitRects "cover"), sampled linearly.
struct Cover {
    // The canvas (device pixels), the photo's drawn origin (device pixels).
    canvas: vec4<f32>,
    // The photo's drawn size (device pixels), unused ×2.
    image: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Cover;
@group(0) @binding(1) var photo: texture_2d<f32>;
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

@fragment
fn cover(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy;
    let uv = (p - u.canvas.zw) / u.image.xy;
    return vec4<f32>(textureSampleLevel(photo, smp, uv, 0.0).rgb, 1.0);
}

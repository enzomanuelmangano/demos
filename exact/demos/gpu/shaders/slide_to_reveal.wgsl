// Slide To Reveal (src/animations/slide-to-reveal/components): the canvas, composed per pixel.
// The background RoundedRect (#0F0F0F, r 20); then, at the content's opacity, the code's six
// digits blurred (BlurMask 7, under the alpha Mask, whose white circle covers the canvas: its
// black circle adds no alpha, so the blurred digits show everywhere), and over them the sharp
// digits under the luminance Mask: a white circle (r 60, BlurMask 15) at the finger, at
// maskOpacity. Each digit is scaled about its own pivot (ScaleableCharacter).
//
// `atlas` holds the six digits blurred at scale 1, each in its own cell (BlurMask respects the
// transform: a digit scaled by k and blurred by 7k is the digit blurred by 7, scaled by k);
// `sharp` the sharp digits as this frame scales them; `spot` the blurred circle.
struct Uniforms {
    // The canvas (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
    // The canvas (points), the content's opacity, maskOpacity.
    view: vec4<f32>,
    // The finger (points), the atlas's size (points).
    finger: vec4<f32>,
    // The spot texture's size (points), a cell's width, the pen's x in its cell.
    cells: vec4<f32>,
    // Per digit: its pivot (points), its scale, its pen x in the canvas.
    digit: array<vec4<f32>, 6>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var sharp: texture_2d<f32>;
@group(0) @binding(3) var spot: texture_2d<f32>;
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

fn rrect(p: vec2<f32>, origin: vec2<f32>, size: vec2<f32>, radius: f32) -> f32 {
    let half = size * 0.5;
    let r = min(radius, min(half.x, half.y));
    let d = abs(p - origin - half) - half + vec2<f32>(r);
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = in.uv * u.canvas.xy / s;
    let size = u.view.xy;
    let bg = clamp(0.5 - rrect(p, vec2<f32>(0.0), size, 20.0) * s, 0.0, 1.0);
    // The blurred digits, each read where its scale puts this pixel.
    var blurred = 0.0;
    for (var i = 0u; i < 6u; i = i + 1u) {
        let d = u.digit[i];
        let q = d.xy + (p - d.xy) / d.z;
        let cell = f32(i) * u.cells.z;
        let a = vec2<f32>(q.x - d.w + cell + u.cells.w, q.y);
        if (a.x >= cell && a.x < cell + u.cells.z && a.y >= 0.0 && a.y <= u.finger.w) {
            let k = textureSampleLevel(atlas, smp, a / u.finger.zw, 0.0).a;
            blurred = blurred + k * (1.0 - blurred);
        }
    }
    // The spot: the finger's blurred circle, at maskOpacity.
    let st = (p - u.finger.xy) / u.cells.xy + vec2<f32>(0.5);
    var lum = 0.0;
    if (all(st >= vec2<f32>(0.0)) && all(st <= vec2<f32>(1.0))) {
        lum = textureSampleLevel(spot, smp, st, 0.0).a * u.view.w;
    }
    let t = textureLoad(sharp, vec2<i32>(in.pos.xy), 0).a * lum;
    let content = (t + blurred * (1.0 - t)) * u.view.z;
    // #0F0F0F under the white content (premultiplied).
    var rgb = vec3<f32>(15.0 / 255.0);
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    let a = content + bg * (1.0 - content);
    return vec4<f32>(vec3<f32>(content) + rgb * bg * (1.0 - content), a);
}

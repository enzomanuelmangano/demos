// Prequel Slider (src/animations/prequel-slider): the screen's canvas, composed. The ImageEditor's
// Fill is the runtime shader of src/gl-transition (gl-transitions' ButterflyWaveScrawler, its
// progress halved) over image-editor/utils/transition.ts: both children are the same
// ImageShader (fit "cover" over width × height, tile decal, linear filter, no mipmaps), read at
// uv · resolution; it is clipped to the editor's continuous corners (`mask`'s coverage). Over it,
// `ui`: the donut, the slider's lines and the indicator, premultiplied. Skia runs the shader on
// encoded sRGB values; out: premultiplied, in the target's encoding.
struct Uniforms {
    // The editor canvas's origin (device pixels), the pixels per point, progress.
    editor: vec4<f32>,
    // resolution (the `width`, `height` props, points), whether the target encodes sRGB
    // itself, unused.
    res: vec4<f32>,
    // The image's size (pixels), the cover scale, unused.
    image: vec4<f32>,
    // The cover translation (points), unused ×2.
    cover: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var photo: texture_2d<f32>;
@group(0) @binding(2) var ui: texture_2d<f32>;
@group(0) @binding(3) var mask: texture_2d<f32>;
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

const PI: f32 = 3.14159265358979323846264;

// The ImageShader at the canvas's local point `p`: image pixel q = (p − t) / s, bilinear, and
// outside the image transparent (decal: the filter reads transparent texels past the edge).
fn photo_at(p: vec2<f32>) -> vec4<f32> {
    let size = u.image.xy;
    let q = (p - u.cover.xy) / u.image.z;
    let inside = clamp(q + 0.5, vec2<f32>(0.0), vec2<f32>(1.0)) * clamp(size - q + 0.5, vec2<f32>(0.0), vec2<f32>(1.0));
    return textureSampleLevel(photo, smp, q / size, 0.0) * inside.x * inside.y;
}

// getFromColor / getToColor.
fn color_at(uv: vec2<f32>) -> vec4<f32> {
    return photo_at(uv * u.res.xy);
}

// compute(p, progress, center): amplitude 1.5, waves 10.
fn compute(p: vec2<f32>, progress: f32, center: vec2<f32>) -> f32 {
    let o = p * sin(progress * 1.5) - center;
    let theta = acos(dot(o, vec2<f32>(1.0, 0.0))) * 10.0;
    return (exp(cos(theta)) - 2.0 * cos(4.0 * theta) + pow(sin((2.0 * theta - PI) / 24.0), 5.0)) / 10.0;
}

// transition(uv): colorSeparation 3.
fn transition(uv: vec2<f32>) -> vec4<f32> {
    let real_progress = u.editor.w * 0.5;
    let inv = 1.0 - real_progress;
    let disp = compute(uv, real_progress, vec2<f32>(0.5, 0.5));
    let tex_to = color_at(uv + inv * disp);
    let tex_from = vec4<f32>(
        color_at(uv + real_progress * disp * (1.0 - 3.0)).r,
        color_at(uv + real_progress * disp).g,
        color_at(uv + real_progress * disp * (1.0 + 3.0)).b,
        1.0,
    );
    return tex_to * real_progress + tex_from * inv;
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let px = vec2<i32>(in.pos.xy);
    let top = textureLoad(ui, px, 0);
    var c = top;
    let m = textureLoad(mask, px, 0).a;
    if (m > 0.0) {
        // main(xy): the editor canvas's local point of this pixel's centre.
        let xy = (in.pos.xy - u.editor.xy) / u.editor.z;
        let e = clamp(transition(xy / u.res.xy), vec4<f32>(0.0), vec4<f32>(1.0)) * m;
        c = top + e * (1.0 - top.a);
    }
    if (u.res.z > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}

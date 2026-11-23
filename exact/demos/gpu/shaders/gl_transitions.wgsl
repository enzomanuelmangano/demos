// GL Transitions (src/animations/gl-transitions): the provider's canvas. Its Fill is the runtime
// effect of providers/gl-transitions/utils/transition.ts wrapping the-magic/directional-warp.ts
// (gl-transitions' DirectionalWarp): `image1` is the FIRST ImageShader child, the second
// snapshot (the screen when runTransition ran), `image2` the first one (the screen when
// prepareTransition ran); both `fit="cover"` over the window's width × height, decal, linear
// filter, no mipmaps (RN Skia's ImageShader defaults), read at uv · resolution.
//
// The snapshots are makeImageFromView's: drawViewHierarchyInRect into a DeviceRGB (sRGB) context,
// wrapped by Skia with no colour space, which Skia reads as sRGB. Skia samples the texels as
// stored (bilinear on the encoded values), then converts them into the canvas's Display P3
// working space; the effect mixes P3 values, which the 8-bit P3 surface stores and iOS shows as
// P3: turned into sRGB here.
//
// `copy` shows a scene texture as is (the live screen, or a snapshot on the frame it is taken:
// the canvas is under the screens while progress is 0).
struct Uniforms {
    // resolution (points), the pixels per point, progress.
    res: vec4<f32>,
    // The snapshots' size (pixels), the cover scale (points per pixel), whether the target
    // encodes sRGB itself.
    image: vec4<f32>,
    // The cover translation (points), which snapshot `copy` shows (0: image1, 1: image2), unused.
    cover: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var image1: texture_2d<f32>;
@group(0) @binding(2) var image2: texture_2d<f32>;
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
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded sRGB to encoded Display P3 (in gamut: no clip), and back, clipped to sRGB.
fn srgb_to_p3(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        0.8224621 * l.r + 0.1775380 * l.g,
        0.0331941 * l.r + 0.9668058 * l.g,
        0.0170827 * l.r + 0.0723974 * l.g + 0.9105199 * l.b));
}
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b));
}

// A premultiplied encoded-sRGB texel in the P3 working space (premultiplied).
fn to_working(c: vec4<f32>) -> vec4<f32> {
    if (c.a <= 0.0) {
        return vec4<f32>(0.0);
    }
    return vec4<f32>(srgb_to_p3(c.rgb / c.a) * c.a, c.a);
}

// The ImageShader at the canvas's local point `p`: image pixel q = (p − t) / s, bilinear, and
// outside the image transparent (decal: the filter reads transparent texels past the edge).
fn sample_cover(img: texture_2d<f32>, p: vec2<f32>) -> vec4<f32> {
    let size = u.image.xy;
    let q = (p - u.cover.xy) / u.image.z;
    let inside = clamp(q + 0.5, vec2<f32>(0.0), vec2<f32>(1.0)) * clamp(size - q + 0.5, vec2<f32>(0.0), vec2<f32>(1.0));
    return textureSampleLevel(img, smp, q / size, 0.0) * inside.x * inside.y;
}

// getFromColor(uv): image1.eval(uv * resolution).
fn get_from_color(uv: vec2<f32>) -> vec4<f32> {
    return to_working(sample_cover(image1, uv * u.res.xy));
}

// getToColor(uv): image2.eval(uv * resolution).
fn get_to_color(uv: vec2<f32>) -> vec4<f32> {
    return to_working(sample_cover(image2, uv * u.res.xy));
}

// DirectionalWarp: direction (0, 1), smoothness 0.5, center (0.5, 0.5).
const DIRECTION: vec2<f32> = vec2<f32>(0.0, 1.0);
const SMOOTHNESS: f32 = 0.50;
const CENTER: vec2<f32> = vec2<f32>(0.5, 0.5);

fn transition(uv: vec2<f32>) -> vec4<f32> {
    let progress = u.res.w;
    var v = normalize(DIRECTION);
    v = v / (abs(v.x) + abs(v.y));
    let d = v.x * CENTER.x + sin(v.y * CENTER.y);
    var m = 1.0 - smoothstep(-SMOOTHNESS, 0.0, v.x * uv.x + v.y * uv.y - (d - 0.5 + progress * (1.0 + SMOOTHNESS)));

    // Calculate the distance from the center for visualization (pow(x, 2.0) as a product: WGSL's
    // pow is undefined below 0, and RN's warp shows the square there).
    let dx = uv.x - CENTER.x;
    let dy = uv.y - CENTER.y;
    let circle = sqrt(dx * dx + dy * dy);

    // Output the radius as a color gradient
    let radius_color = vec3<f32>(circle, circle, circle);

    // Adjust the expansion direction to be from top to bottom
    m = m * smoothstep(0.0, 0.5, 1.5 - circle);

    return mix(vec4<f32>(radius_color, 1.0), mix(get_from_color((uv - 0.5) * (1.0 - m) + 0.5), get_to_color((uv - 0.5) * m + 0.5), m), step(0.0, m));
}

// The output as the target wants it: encoded sRGB, or linear for an sRGB target (premultiplied).
fn out_srgb(c: vec4<f32>) -> vec4<f32> {
    if (u.image.w > 0.5 && c.a > 0.0) {
        return vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}

@fragment
fn transition_fs(in: Out) -> @location(0) vec4<f32> {
    // main(xy): the pixel's centre in the canvas's points.
    let xy = in.pos.xy / u.res.z;
    let uv = xy / u.res.xy;
    // The 8-bit Display P3 surface stores it (clamped, premultiplied), iOS shows it as P3.
    let p3 = round(clamp(transition(uv), vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
    var c = vec4<f32>(0.0);
    if (p3.a > 0.0) {
        c = vec4<f32>(p3_to_srgb(p3.rgb / p3.a) * p3.a, p3.a);
    }
    return out_srgb(c);
}

@fragment
fn copy_fs(in: Out) -> @location(0) vec4<f32> {
    let px = vec2<i32>(in.pos.xy);
    if (u.cover.z > 0.5) {
        return out_srgb(textureLoad(image2, px, 0));
    }
    return out_srgb(textureLoad(image1, px, 0));
}

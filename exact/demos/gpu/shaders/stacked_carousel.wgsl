// Stacked Carousel (src/animations/stacked-carousel): the cards near the current page, each a
// 320 × 200 view under [translateY, scale] and, inside it, [perspective 600, rotateX], as Core
// Animation draws them: a pixel shows the point of the card's plane its inverse transform
// finds there. A card is its layer (the white continuous rounded rect over its box shadow,
// drawn once in the card's points with MARGIN around it), times the card's opacity, drawn back
// to front over #eeeeee. Then the paginator's dots: rgba(0, 0, 0, 0.15) circles, each at its
// scale and opacity, clipped to the paginator's 40 pt strip.
struct Uniforms {
    // Per card slot: screen points → the card's points (the inverse projective 3×3, three rows;
    // the first row's w is the card's opacity, 0 for an empty slot).
    cards: array<vec4<f32>, 15>,
    // Per dot: centre x, centre y, radius (with its scale), opacity.
    dots: array<vec4<f32>, 20>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
    // The layer: card width, height, margin; the paginator strip's top.
    layer: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var card: texture_2d<f32>;
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
    let p = in.uv * u.canvas.xy / u.canvas.z;
    var c = vec3<f32>(238.0, 238.0, 238.0) / 255.0;
    let size = u.layer.xy + vec2<f32>(2.0 * u.layer.z);
    for (var k = 0; k < 5; k = k + 1) {
        let r0 = u.cards[k * 3];
        let r1 = u.cards[k * 3 + 1];
        let r2 = u.cards[k * 3 + 2];
        let opacity = r0.w;
        if (opacity <= 0.0) {
            continue;
        }
        let h = vec3<f32>(p, 1.0);
        let q = vec3<f32>(dot(r0.xyz, h), dot(r1.xyz, h), dot(r2.xyz, h));
        if (q.z <= 0.0) {
            continue;
        }
        let uv = (q.xy / q.z + vec2<f32>(u.layer.z)) / size;
        if (any(uv < vec2<f32>(0.0)) || any(uv > vec2<f32>(1.0))) {
            continue;
        }
        let s = textureSampleLevel(card, smp, uv, 0.0) * opacity;
        c = c * (1.0 - s.a) + s.rgb;
    }
    let top = u.layer.w;
    if (p.y >= top && p.y <= top + 40.0) {
        let px = 1.0 / u.canvas.z;
        for (var i = 0; i < 20; i = i + 1) {
            let d = u.dots[i];
            if (d.w <= 0.0 || d.z <= 0.0) {
                continue;
            }
            let dist = length(p - d.xy) - d.z;
            let cover = clamp(0.5 - dist / px, 0.0, 1.0) * 0.15 * d.w;
            c = c * (1.0 - cover);
        }
    }
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}

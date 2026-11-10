// Card Shader Reflections' screen (src/animations/card-shader-reflections): the four cards as
// Core Animation composites them. Each card's Animated.View carries `[rotate 18deg, perspective
// 1200, translateY, rotateY]` about its centre; a pixel shows the point of the card's plane its
// inverse projective map finds there (each cardContainer flattens its card: painted in index
// order). In that plane (styles.card's points, origin at its top-left):
// - its <Canvas>: the card shader's 8-bit layer (card_shader_reflections.wgsl), sampled bilinearly
//   as a layer's contents are, clipped by the container view's circular radius 20 (RN moves an
//   `overflow: hidden` view with a boxShadow into a container whose layer has no cornerCurve);
// - over it, cardContent's opacity 0.7 group: the chip (its Animated opacity) and the title
//   (Math.round of its opacity), drawn once into the atlas, each in its card's slot;
// - its boxShadow (RCTBoxShadow: black 0.3, shadowRadius 10, offset 0 10, outside the bounds'
//   rounded rect only), drawn once into the atlas;
// - the Animated.View's opacity over the group (UIKit's group opacity).
// Everything composites in Display P3's encoding (RN's views and Skia's layers are P3) over #111;
// the result is turned into sRGB at the end.
struct Uniforms {
    // Per card, three rows: screen points → the card's plane points (inverse projective 3×3).
    inv: array<vec4<f32>, 12>,
    // Per card: visible (1), the Animated.View's opacity, the chip's alpha, the title's alpha
    // (each × cardContent's 0.7).
    look: array<vec4<f32>, 4>,
    // Per card: its overlay slot's left edge in the atlas (device pixels); unused.
    slot: array<vec4<f32>, 4>,
    // The card's clip: width, height, radius (points); the chip / title split (points).
    card: vec4<f32>,
    // The canvas layer (device pixels: width, height); the atlas (width, height).
    tex: vec4<f32>,
    // The shadow's region in the plane: left, top, width, height (points), at the atlas's (0, 0).
    shadow: vec4<f32>,
    // The overlay slot's width, height (points); unused.
    overlay: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var layers: texture_2d_array<f32>;
@group(0) @binding(2) var atlas: texture_2d<f32>;
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
// Display P3 (sRGB's transfer curve) to sRGB, clipped to the sRGB gamut.
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = to_linear(c);
    return enc(vec3<f32>(1.2249 * l.r - 0.2247 * l.g, -0.0420 * l.r + 1.0419 * l.g, -0.0197 * l.r - 0.0786 * l.g + 1.0979 * l.b));
}

// A rounded rect's signed distance (circular corners): centre-relative `p`, half size `b`.
fn rrect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn within(p: vec2<f32>, size: vec2<f32>) -> bool {
    return all(p >= vec2<f32>(0.0)) && all(p <= size);
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let p = in.pos.xy / s;
    // styles.container: #111.
    var c = vec3<f32>(17.0 / 255.0);
    let size = u.card.xy;
    for (var k = 0u; k < 4u; k = k + 1u) {
        let look = u.look[k];
        if (look.x < 0.5) {
            continue;
        }
        let h = vec3<f32>(p, 1.0);
        let q = vec3<f32>(dot(u.inv[3u * k].xyz, h), dot(u.inv[3u * k + 1u].xyz, h), dot(u.inv[3u * k + 2u].xyz, h));
        let l = q.xy / q.z;
        // The container's clip, antialiased in screen space.
        let d = rrect(l - size * 0.5, size * 0.5, u.card.z);
        let fw = max(fwidth(d), 1e-4);
        var cover = clamp(0.5 - d / fw, 0.0, 1.0);
        if (q.z <= 0.0) {
            cover = 0.0;
        }
        // The canvas layer (Display P3, opaque).
        let luv = l * s / u.tex.xy;
        var content = textureSampleLevel(layers, smp, luv, i32(k), 0.0).rgb;
        // cardContent's group: the chip or the title, by where the point is.
        let slot = u.overlay.xy;
        if (q.z > 0.0 && within(l, slot)) {
            let auv = (vec2<f32>(u.slot[k].x, 0.0) + l * s) / u.tex.zw;
            let o = textureSampleLevel(atlas, smp, auv, 0.0);
            let a = select(look.w, look.z, l.y < u.card.w);
            content = o.rgb * a + content * (1.0 - o.a * a);
        }
        // The box shadow, masked to outside the bounds' rounded rect (RCTBoxShadow's even-odd
        // mask), over the clipped content.
        var shade = 0.0;
        let sl = l - u.shadow.xy;
        if (q.z > 0.0 && within(sl, u.shadow.zw)) {
            shade = textureSampleLevel(atlas, smp, sl * s / u.tex.zw, 0.0).a * (1.0 - cover);
        }
        let group_rgb = content * cover * (1.0 - shade);
        let group_a = shade + cover * (1.0 - shade);
        // The Animated.View's opacity over the flattened group.
        c = c * (1.0 - look.y * group_a) + look.y * group_rgb;
    }
    var rgb = p3_to_srgb(c);
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb, 1.0);
}

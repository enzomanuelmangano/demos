// Card Shader Reflections' screen: the four cards as Core Animation composites them, each a
// physical card. Each card's Animated.View carries `[rotate 18deg, perspective 1200, translateY,
// rotateY]` (and, past RN, the finger's tilt) about its centre; a pixel shows the point of the
// card's plane its inverse projective map finds there (painted in index order). In that plane
// (styles.card's points, origin at its top-left):
// - its <Canvas>: the card's 8-bit layer (card_shader_reflections.wgsl), sampled bilinearly,
//   clipped by a continuous (squircle) radius 20, antialiased in screen space;
// - the title, laser-engraved into the metal: the atlas's glyph coverage as a mask, a matte
//   floor with a shadowed near wall and a lit far wall (the chip is the layer's own now);
// - its shadow, analytic: a soft ambient one and a tight contact one under the card, offset
//   with the turn and the tilt (the surface's per-card offset; 0 rests it low right), masked
//   to outside the card;
// - the Animated.View's opacity over the group (UIKit's group opacity).
// Everything composites in Display P3's encoding over #111; the result is turned into sRGB.
struct Uniforms {
    // Per card, three rows: screen points → the card's plane points (inverse projective 3×3).
    inv: array<vec4<f32>, 12>,
    // Per card: visible (1), the Animated.View's opacity, the chip's alpha, the title's alpha
    // (each × cardContent's 0.7).
    look: array<vec4<f32>, 4>,
    // Per card: its overlay slot's left edge in the atlas (device pixels); the shadow's extra
    // offset (points, in the card's plane); the press (0…1).
    slot: array<vec4<f32>, 4>,
    // The card's clip: width, height, radius (points); the chip / title split (points).
    card: vec4<f32>,
    // The canvas layer (device pixels: width, height); the atlas (width, height).
    tex: vec4<f32>,
    // The shadow's region in the plane: left, top, width, height (points); unused now.
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

// Core Animation's continuous corner (as the card shader's `squircle`): centre-relative `p`,
// half size `b`, radius `r`.
fn squircle(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let e = min(r * 1.528, min(b.x, b.y));
    let q = abs(p) - b + vec2<f32>(e);
    let m = max(q, vec2<f32>(0.0));
    let n = 3.26;
    let corner = pow(pow(m.x, n) + pow(m.y, n), 1.0 / n);
    return corner + min(max(q.x, q.y), 0.0) - e;
}

fn within(p: vec2<f32>, size: vec2<f32>) -> bool {
    return all(p >= vec2<f32>(0.0)) && all(p <= size);
}

/// A rounded rect's soft shadow: coverage at distance `d` for a blur `sigma` (a smoothstep
/// fitted to the Gaussian's integral).
fn soft(d: f32, sigma: f32) -> f32 {
    return 1.0 - smoothstep(-1.6 * sigma, 1.9 * sigma, d);
}

/// The atlas's glyph coverage at plane point `l` of card `k` (0 outside its slot).
fn glyph(l: vec2<f32>, k: u32, s: f32) -> f32 {
    if (!within(l, u.overlay.xy)) {
        return 0.0;
    }
    let auv = (vec2<f32>(u.slot[k].x, 0.0) + l * s) / u.tex.zw;
    return textureSampleLevel(atlas, smp, auv, 0.0).a;
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
        let front = q.z > 0.0;
        // The clip, antialiased in screen space.
        let d = squircle(l - size * 0.5, size * 0.5, u.card.z);
        let fw = max(fwidth(d), 1e-4);
        var cover = clamp(0.5 - d / fw, 0.0, 1.0);
        if (!front) {
            cover = 0.0;
        }
        // The layer (Display P3, opaque).
        let luv = l * s / u.tex.xy;
        var content = textureSampleLevel(layers, smp, luv, i32(k), 0.0).rgb;
        // The engraved title (below the chip's band; the chip is in the layer).
        if (front && look.w > 0.0 && l.y >= u.card.w) {
            let a = glyph(l, k, s);
            if (a > 0.0) {
                // Toward the light (up left on the card) and away from it.
                let o = vec2<f32>(0.42, 0.42);
                let near = a * (1.0 - glyph(l - o, k, s));
                let far = a * (1.0 - glyph(l + o, k, s));
                let lum = dot(content, vec3<f32>(0.2126, 0.7152, 0.0722));
                // A matte floor: lighter on the dark titanium (k 0), darker on the light metals.
                var etched = content * 0.58;
                if (k == 0u) {
                    etched = vec3<f32>(0.30, 0.30, 0.31) + content * 0.25;
                }
                etched = etched * (1.0 - 0.45 * near) + vec3<f32>(0.22) * far * (0.4 + lum);
                content = mix(content, etched, a);
            }
        }
        // The shadow: ambient and contact, offset with the card's turn and tilt.
        var shade = 0.0;
        if (front) {
            let press = u.slot[k].w;
            let off = vec2<f32>(3.0, 12.0) + u.slot[k].yz;
            let ambient = soft(squircle(l - size * 0.5 - off * (1.0 + 0.6 * press), size * 0.5 - vec2<f32>(4.0), u.card.z), 18.0 + 8.0 * press);
            let contact = soft(squircle(l - size * 0.5 - vec2<f32>(0.0, 2.5) - off * 0.15, size * 0.5 - vec2<f32>(1.0), u.card.z), 3.0 + 2.0 * press);
            shade = (1.0 - (1.0 - 0.62 * ambient) * (1.0 - 0.38 * contact * (1.0 - 0.5 * press))) * (1.0 - cover);
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

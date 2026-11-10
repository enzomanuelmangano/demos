// Blur Cards (src/animations/blur-cards): five glass cards, drawn in order, each one
// <Path> fill (rgba(255,255,255,0.1)), <Path> stroke (2, rgba(255,255,255,0.2), opacity =
// progress) and a <BackdropBlur clip={card}> that blurs everything drawn so far (its own fill and
// stroke too) inside the card. A card is a rounded rect (300 × 200, radius 20) seen through its
// group's 3D transform: a pixel finds the card's point with the inverse projective 3×3 and
// covers by the rounded rect's distance there, anti-aliased by its screen-space derivative.
//
// One pass per card boundary: the canvas so far (`cur`), inside the previous card replaced by
// its blur (`blurred`), then the next card's fill and stroke. The first pass starts from the
// background: black under the blurred radial gradient (`bg`).
struct Pass {
    // Screen points → the previous card's points (whose backdrop blur ends here), by rows.
    prev0: vec4<f32>,
    prev1: vec4<f32>,
    prev2: vec4<f32>,
    // Screen points → the next card's points (drawn here).
    next0: vec4<f32>,
    next1: vec4<f32>,
    next2: vec4<f32>,
    // x: 1 when there is a previous card, y: 1 when there is a next one, z: the stroke's
    // opacity (progress), w: 1 to start from the background.
    flags: vec4<f32>,
    // The target (device pixels), device pixels per point, 1 to write linear (an sRGB target).
    canvas: vec4<f32>,
    // The card's rect in its points: centre x, y, half width, half height.
    rect: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Pass;
@group(0) @binding(1) var cur: texture_2d<f32>;
@group(0) @binding(2) var blurred: texture_2d<f32>;
@group(0) @binding(3) var bg: texture_2d<f32>;
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

fn rrect(p: vec2<f32>, b: vec2<f32>, r: f32) -> f32 {
    let q = abs(p) - b + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// The card's signed distance at screen point `p` through the inverse rows; far outside behind
// the eye.
fn card(r0: vec4<f32>, r1: vec4<f32>, r2: vec4<f32>, p: vec2<f32>) -> f32 {
    let h = vec3<f32>(p, 1.0);
    let q = vec3<f32>(dot(r0.xyz, h), dot(r1.xyz, h), dot(r2.xyz, h));
    let l = q.xy / q.z;
    return select(1e6, rrect(l - u.rect.xy, u.rect.zw, 20.0), q.z > 0.0);
}

@fragment
fn card_pass(in: Out) -> @location(0) vec4<f32> {
    let p = in.uv * u.canvas.xy / u.canvas.z;
    let dp = card(u.prev0, u.prev1, u.prev2, p);
    let fp = max(fwidth(dp), 1e-4);
    let dn = card(u.next0, u.next1, u.next2, p);
    let fnext = max(fwidth(dn), 1e-4);
    let below = textureSampleLevel(cur, smp, in.uv, 0.0).rgb;
    let blur = textureSampleLevel(blurred, smp, in.uv, 0.0).rgb;
    let back = textureSampleLevel(bg, smp, in.uv, 0.0).rgb;

    var c = select(below, back, u.flags.w > 0.5);
    if (u.flags.x > 0.5) {
        c = mix(c, blur, clamp(0.5 - dp / fp, 0.0, 1.0));
    }
    if (u.flags.y > 0.5) {
        c = mix(c, vec3<f32>(1.0), 0.1 * clamp(0.5 - dn / fnext, 0.0, 1.0));
        c = mix(c, vec3<f32>(1.0), 0.2 * u.flags.z * clamp(0.5 - (abs(dn) - 1.0) / fnext, 0.0, 1.0));
    }
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}

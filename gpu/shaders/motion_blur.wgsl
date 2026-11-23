// Motion Blur (src/animations/motion-blur): the list's cards with a real motion blur. Each card is
// its layer (shadows, white continuous rounded rect, emoji circle, emoji, amount and address),
// drawn once into a slot of `atlas` at the screen's scale. A pixel integrates what a camera with
// an open shutter would record: the card's radiance over the exposure, each sample the card
// under its transform at one instant (scale s, offset o: screen px = s · slot px + o) times its
// opacity then. The CPU evaluates the analytic motion (the keyframe, the spring, the exit) at
// N + 1 knots across the shutter and M samples in each interval between them, N · M chosen so
// consecutive samples land well under a device pixel apart; every sample is shifted by a
// per-pixel offset (interleaved gradient noise), so no comb survives, weighted by a Hann window over
// the shutter, and fetched bilinearly (a tent filter in space). The integral is
// taken in linear light; the card's result goes back to sRGB and composites over the cards
// drawn before it as Core Animation blends (in the encoded values). A still card is one sample:
// its texels exactly, unchanged from a plain draw.
struct Uniforms {
    // Per card, in draw order: the pixels its samples can reach (x0, y0, x1, y1, device px);
    // empty (x1 < x0) for no card.
    bounds: array<vec4<f32>, 8>,
    // Per card: its slot in the atlas (x, y, w, h, px).
    slots: array<vec4<f32>, 8>,
    // Per card: the knot intervals N, the index of its first knot, the samples per interval
    // M (0 reads as 1).
    info: array<vec4<f32>, 8>,
    // The knots: scale, offset x, offset y (device px), opacity. One knot when N is 1 (the
    // frame's instant), else N + 1 spanning the shutter.
    knots: array<vec4<f32>, 520>,
    // The target (px), the atlas (px).
    canvas: vec4<f32>,
    // x: 1 when the target encodes sRGB itself (write linear).
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var atlas: texture_2d<f32>;
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

fn to_srgb(c: vec3<f32>) -> vec3<f32> {
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}

// Jimenez's interleaved gradient noise: a per-pixel offset in [0, 1), even in every 3 × 3.
fn ign(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(floor(p), vec2<f32>(0.06711056, 0.00583715))));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.pos.xy;
    let size = u.canvas.zw;
    var res = vec4<f32>(0.0);
    for (var c = 0; c < 8; c = c + 1) {
        let b = u.bounds[c];
        if (p.x < b.x || p.y < b.y || p.x > b.z || p.y > b.w) {
            continue;
        }
        let slot = u.slots[c];
        let n = i32(u.info[c].x);
        let base = i32(u.info[c].y);
        let m = max(i32(u.info[c].z), 1);
        var acc = vec4<f32>(0.0);
        if (n <= 1) {
            // Still over the shutter: its texels, once.
            let k = u.knots[base];
            let q = (p - k.yz) / k.x;
            if (k.w > 0.0 && q.x >= 0.0 && q.y >= 0.0 && q.x <= slot.z && q.y <= slot.w) {
                let t = textureSampleLevel(atlas, smp, (slot.xy + q) / size, 0.0);
                if (t.a > 0.0) {
                    acc = vec4<f32>(to_linear(t.rgb / t.a) * t.a, t.a) * k.w;
                }
            }
        } else {
            // N · M stratified instants across the shutter, all shifted by the pixel's noise
            // (what steps remain become grain), each weighted by a Hann window over the
            // exposure (the streak fades in and out instead of ending on a hard copy).
            let xi = ign(p);
            let total = f32(n * m);
            var wsum = 0.0;
            for (var j = 0; j < n; j = j + 1) {
                let k0 = u.knots[base + j];
                let k1 = u.knots[base + j + 1];
                for (var i = 0; i < m; i = i + 1) {
                    let f = (f32(i) + xi) / f32(m);
                    let tau = (f32(j * m + i) + xi) / total;
                    // A Hann shutter: opening and closing smoothly, a soft-ended streak
                    // (Gaussian-like, no hard copy at either end).
                    let w = 0.5 - 0.5 * cos(6.2831853 * tau);
                    wsum = wsum + w;
                    let k = mix(k0, k1, f);
                    if (k.w <= 0.0) {
                        continue;
                    }
                    let q = (p - k.yz) / k.x;
                    if (q.x < 0.0 || q.y < 0.0 || q.x > slot.z || q.y > slot.w) {
                        continue;
                    }
                    let t = textureSampleLevel(atlas, smp, (slot.xy + q) / size, 0.0);
                    if (t.a > 0.0) {
                        acc = acc + vec4<f32>(to_linear(t.rgb / t.a) * t.a, t.a) * (k.w * w);
                    }
                }
            }
            acc = acc / max(wsum, 1e-6);
        }
        if (acc.a > 1e-5) {
            let e = vec4<f32>(to_srgb(clamp(acc.rgb / acc.a, vec3<f32>(0.0), vec3<f32>(1.0))) * acc.a, acc.a);
            res = e + res * (1.0 - e.a);
        }
    }
    if (u.flags.x > 0.5 && res.a > 0.0) {
        res = vec4<f32>(to_linear(res.rgb / res.a) * res.a, res.a);
    }
    return res;
}

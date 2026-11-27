// Arena's floor (RN src/components/arena/arena-floor.tsx): the SkSL runtime effect drawn over the
// whole window (70-217), a chess clock's dial lying on Journey's floor, and over it, while the list
// is pulled, the stopwatch Skia's Picture strokes (713-772): its track, the arc the pull fills, the
// crown, the hand, and the burst when the ring closes. Skia blends in the canvas's sRGB; this does
// the same, premultiplied, and converts at the end when the target encodes sRGB itself.
struct Floor {
    // the canvas in points (xy), device pixels per point (z), the scroll from rest in points (w,
    // pulled down negative)
    view: vec4<f32>,
    // the dial's ink (rgb, sRGB) and its strength (w)
    tint: vec4<f32>,
    // the hour, minute and second hands' angles from twelve, clockwise (xyz); their opacity (w)
    hands: vec4<f32>,
    // 1 while the second hand is out (x); the face's ink (y); the core's (z) and the halo's (w) opacity
    light: vec4<f32>,
    // the core's colour (rgb); how far the hands are lifted toward white (w)
    core: vec4<f32>,
    // the halo's colour (rgb); 1 when the target encodes sRGB itself (w)
    halo: vec4<f32>,
    // the stopwatch's centre in points (xy), how far the list is pulled (z), the ring's fill (w)
    watch: vec4<f32>,
    // the burst, 0 -> 1 (x; 0 none)
    burst: vec4<f32>,
}

@group(0) @binding(0) var<uniform> f: Floor;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

const TAU: f32 = 6.2831853;
// LIGHT_AT, GRAIN, GRAIN_CELL, HAND_INK (arena-floor.tsx:97-111).
const LIGHT_AT: f32 = 0.5;
const GRAIN: f32 = 0.02;
const GRAIN_CELL: f32 = 1.0;
const HAND_INK: f32 = 0.95;
// WATCH_RADIUS, the stroke's width, SPARKS (231-234, 618-625).
const WATCH_R: f32 = 10.0;
const STROKE: f32 = 2.0;
const SPARKS: f32 = 8.0;
// PULL_TO_REVEAL.
const PULL_TO_REVEAL: f32 = 110.0;

fn ss(e0: f32, e1: f32, x: f32) -> f32 {
    let t = clamp((x - e0) / (e1 - e0), 0.0, 1.0);
    return t * t * (3.0 - 2.0 * t);
}

// GLSL's mod: x − y·floor(x/y), never negative for a positive y.
fn gmod(x: f32, y: f32) -> f32 {
    return x - y * floor(x / y);
}

fn grain(px: vec2<f32>) -> f32 {
    return fract(sin(dot(px, vec2<f32>(12.9898, 78.233))) * 43758.5453) - 0.5;
}

fn hand(d: vec2<f32>, ang: f32, len: f32, tail: f32, w0: f32, w1: f32, px: f32) -> f32 {
    let u = vec2<f32>(sin(ang), cos(ang));
    let t = dot(d, u);
    let perp = abs(d.x * u.y - d.y * u.x);
    let w = mix(w0, w1, clamp((t + tail) / (len + tail), 0.0, 1.0));
    return (1.0 - ss(w - px, w + px, perp)) * ss(-tail - px, -tail + px, t) * (1.0 - ss(len - px, len + px, t));
}

fn clock(uv: vec2<f32>) -> vec4<f32> {
    let size = f.view.xy;
    let x = f.view.w / 60.0;
    let tilt = 0.22 * x / sqrt(1.0 + x * x);
    let horizon = 0.6 - tilt;
    let across = 6.0;
    let k = across * (1.0 + horizon);
    let depthScale = k * (1.0 + horizon) * size.y / (size.x * 0.75);
    let dist = 1.0 / (uv.y + horizon);
    let q = vec2<f32>((uv.x - 0.5) * dist * k, dist * depthScale);
    let px = dist * k / (size.x * f.view.z);
    let c = vec2<f32>(0.0, depthScale / (0.95 + horizon));
    let d = q - c;
    let r = length(d);
    let R = 3.4;
    let ang = atan2(d.x, d.y);
    let pitch = TAU / 60.0;
    let n = floor(ang / pitch + 0.5);
    let arc = abs(ang - n * pitch) * r;
    let major = gmod(n, 5.0) == 0.0;
    let len = select(0.2, 0.42, major);
    let w = select(0.025, 0.05, major) * 0.5;
    let tick = (1.0 - ss(w - px, w + px, arc)) * ss(R - len - px, R - len + px, r) * (1.0 - ss(R - px, R + px, r));
    let ring = 1.0 - ss(0.012 - px, 0.012 + px, abs(r - (R + 0.14)));
    let hour = hand(d, f.hands.x, 1.6, 0.25, 0.09, 0.05, px);
    let minute = hand(d, f.hands.y, 2.7, 0.3, 0.065, 0.03, px);
    let second = hand(d, f.hands.z, 2.86, 0.55, 0.022, 0.016, px) * f.light.x;
    let hub = 1.0 - ss(0.13 - px, 0.13 + px, r);
    let disc = 1.0 - ss(R + 0.14 - px, R + 0.14 + px, r);
    return vec4<f32>(max(tick, ring * 0.8), max(max(hour, minute), max(second, hub)) * f.hands.w, disc,
        length(d - vec2<f32>(0.0, R * LIGHT_AT)) / R);
}

// A stroke's coverage at distance `d` from its centre line, `half` wide each side, a device pixel soft.
fn cover(d: f32, half: f32) -> f32 {
    return clamp(0.5 - (d - half) * f.view.z, 0.0, 1.0);
}

fn segment(p: vec2<f32>, a: vec2<f32>, b: vec2<f32>) -> f32 {
    let pa = p - a;
    let ba = b - a;
    let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
    return length(pa - ba * h);
}

fn over(col: vec4<f32>, rgb: vec3<f32>, a: f32) -> vec4<f32> {
    return vec4<f32>(rgb * a, a) + col * (1.0 - a);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn fs(@builtin(position) frag: vec4<f32>) -> @location(0) vec4<f32> {
    let p = frag.xy / f.view.z;
    let uv = p / f.view.xy;
    let c = clock(uv);
    var fade = ss(0.2, 1.0, uv.y);
    fade = fade * fade;
    let tint = f.tint.rgb;
    let faceA = c.z * f.light.y * fade;
    let tickA = c.x * f.tint.w * fade;
    let handA = c.y * HAND_INK * fade;
    let d2 = c.w * c.w;
    let coreA = exp(-6.0 * d2) * f.light.z * c.z * fade;
    let haloA = exp(-1.6 * d2) * f.light.w * c.z * fade;
    var col = vec4<f32>(tint * faceA, faceA);
    col = over(col, f.halo.rgb, haloA);
    col = over(col, f.core.rgb, coreA);
    let lit = clamp((coreA + haloA) * 3.0, 0.0, 1.0);
    let n = grain(floor(p * f.view.z / GRAIN_CELL)) * GRAIN * lit;
    col = vec4<f32>(max(col.rgb + vec3<f32>(n), vec3<f32>(0.0)), col.a);
    col = over(col, tint, tickA);
    let handTint = mix(tint, vec3<f32>(1.0), f.core.w);
    col = over(col, handTint, handA);

    // The stopwatch in the gap the pull opens (shown from 4 pt).
    let pulled = f.watch.z;
    if pulled >= 4.0 {
        let cen = f.watch.xy;
        let ring = f.watch.w;
        let wfade = min(1.0, pulled / PULL_TO_REVEAL);
        let q = p - cen;
        let r = WATCH_R;
        let half = STROKE * 0.5;
        // The track, faint.
        col = over(col, tint, cover(abs(length(q) - r), half) * 0.22 * wfade);
        // The filled arc from twelve, clockwise, round-capped; closed, the whole ring.
        var arcD: f32;
        if ring >= 1.0 {
            arcD = abs(length(q) - r);
        } else {
            let sweep = TAU * ring;
            let rel = gmod(atan2(q.y, q.x) + TAU * 0.25, TAU);
            let e0 = vec2<f32>(0.0, -r);
            let ea = -TAU * 0.25 + sweep;
            let e1 = vec2<f32>(cos(ea), sin(ea)) * r;
            arcD = select(min(length(q - e0), length(q - e1)), abs(length(q) - r), rel <= sweep);
        }
        col = over(col, tint, cover(arcD, half) * wfade);
        // The crown, and the hand sweeping with the pull.
        col = over(col, tint, cover(segment(q, vec2<f32>(0.0, -r - 3.0), vec2<f32>(0.0, -r - 6.0)), half) * wfade);
        col = over(col, tint, cover(segment(q, vec2<f32>(-3.0, -r - 6.0), vec2<f32>(3.0, -r - 6.0)), half) * wfade);
        let a = -TAU * 0.25 + TAU * ring;
        col = over(col, tint, cover(segment(q, vec2<f32>(0.0), vec2<f32>(cos(a), sin(a)) * (r - 4.0)), half) * wfade);
        // The ring closing: a ripple that widens and fades, and sparks that leave it.
        let b = f.burst.x;
        if b > 0.0 && b < 1.0 {
            let out = 1.0 - (1.0 - b) * (1.0 - b) * (1.0 - b);
            let rw = 1.5 * (1.0 - b) + 0.3;
            col = over(col, tint, cover(abs(length(q) - (r + 2.0 + 9.0 * out)), rw * 0.5) * 0.45 * (1.0 - b));
            let sr = 1.3 * (1.0 - b) + 0.4;
            let sd = r + 5.0 + 10.0 * out;
            var spark = 0.0;
            for (var k = 0.0; k < SPARKS; k = k + 1.0) {
                let sa = -TAU * 0.25 + (k / SPARKS) * TAU + TAU * 0.5 / SPARKS;
                spark = max(spark, cover(length(q - vec2<f32>(cos(sa), sin(sa)) * sd), sr));
            }
            col = over(col, tint, spark * (1.0 - b) * (1.0 - b));
        }
    }

    if f.halo.w > 0.5 && col.a > 0.0 {
        // The target encodes sRGB: hand it linear light, unpremultiplied first.
        let straight = col.rgb / col.a;
        return vec4<f32>(to_linear(straight) * col.a, col.a);
    }
    return col;
}

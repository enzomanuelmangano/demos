// Threads Holo Ticket's back side QR code (src/animations/threads-holo-ticket/src/components/
// ticket/back-side.tsx; react-native-qrcode-skia 0.3.1), its 150 × 150 Skia canvas, one pass
// per device pixel, stored at 8 bits (Display P3, premultiplied):
//
//   <Path path={transformMatrixIntoPath(matrix, 150, rounded, gap 0)} style="fill">
//     <LinearGradient start (0, 0) end (150, 150) colors #D4AF37 #8B6914 #4A3C1F />
//
// The path is one contour per dark module: its square, each corner whose two neighbours along
// the edges are light replaced by the quad from one edge's midpoint to the other's through the
// corner. Graphite fills it with 4× MSAA (stencil and cover), each quad as Wang's-formula chords
// (u.chain); a module never leaves its cell, so a sample is inside when its cell is dark and,
// in a rounded corner's quadrant, inside the chords. The gradient is evaluated at the pixel's
// centre, in Display P3.
struct Qr {
    // The surface (device pixels: width, height), device pixels per point, the cell (points).
    canvas: vec4<f32>,
    // Modules per side, the corner's chord count.
    counts: vec4<f32>,
    // The gradient's end (its start is (0, 0)), points.
    gradient: vec4<f32>,
    // The three stops (Display P3, opaque), evenly spaced.
    stops: array<vec4<f32>, 3>,
    // Each module row's dark bits: modules 0–16 in the first float, 17–32 in the second (bit k
    // is module k of that half), two rows per vec4.
    rows: array<vec4<f32>, 17>,
    // The rounded corner's chain from (1, 0) to (0, 1) about the cell's centre, in half cells,
    // two points per vec4.
    chain: array<vec4<f32>, 17>,
};

@group(0) @binding(0) var<uniform> u: Qr;

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

const SAMPLES = array<vec2<f32>, 4>(vec2<f32>(0.375, 0.125), vec2<f32>(0.875, 0.375), vec2<f32>(0.125, 0.625), vec2<f32>(0.625, 0.875));

fn q8v(v: vec4<f32>) -> vec4<f32> {
    return floor(clamp(v, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0 + 0.5) / 255.0;
}

fn dark(i: i32, j: i32) -> bool {
    let n = i32(u.counts.x);
    if (i < 0 || j < 0 || i >= n || j >= n) {
        return false;
    }
    let half = select(0, 1, j >= 17);
    let slot = 2 * i + half;
    let bits = u32(u.rows[slot / 4][slot % 4]);
    return ((bits >> u32(j - 17 * half)) & 1u) == 1u;
}

fn chain_point(k: u32) -> vec2<f32> {
    let v = u.chain[k / 2u];
    return select(v.zw, v.xy, k % 2u == 0u);
}

fn in_chain(q: vec2<f32>, n: u32) -> bool {
    for (var k = 0u; k < n; k = k + 1u) {
        let a = chain_point(k);
        let b = chain_point(k + 1u);
        let e = b - a;
        let w = q - a;
        if (e.x * w.y - e.y * w.x <= 0.0) {
            return false;
        }
    }
    return true;
}

fn inside(sp: vec2<f32>) -> bool {
    let cell = u.canvas.w;
    let j = i32(floor(sp.x / cell));
    let i = i32(floor(sp.y / cell));
    if (!dark(i, j)) {
        return false;
    }
    let d = (sp - (vec2<f32>(f32(j), f32(i)) + 0.5) * cell) / (0.5 * cell);
    // The quadrant's corner rounds when both neighbours along its edges are light.
    let dx = select(-1, 1, d.x >= 0.0);
    let dy = select(-1, 1, d.y >= 0.0);
    if (dark(i, j + dx) || dark(i + dy, j)) {
        return true;
    }
    return in_chain(abs(d), u32(u.counts.y));
}

@fragment
fn qr(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let origin = floor(in.pos.xy);
    var n = 0.0;
    for (var k = 0u; k < 4u; k = k + 1u) {
        if (inside((origin + SAMPLES[k]) / s)) {
            n = n + 1.0;
        }
    }
    if (n == 0.0) {
        return vec4<f32>(0.0);
    }
    let p = in.pos.xy / s;
    let e = u.gradient.xy;
    let t = clamp(dot(p, e) / dot(e, e), 0.0, 1.0);
    let c = select(mix(u.stops[1].rgb, u.stops[2].rgb, t * 2.0 - 1.0), mix(u.stops[0].rgb, u.stops[1].rgb, t * 2.0), t <= 0.5);
    let sample_value = q8v(vec4<f32>(c, 1.0));
    return q8v(sample_value * (n / 4.0));
}

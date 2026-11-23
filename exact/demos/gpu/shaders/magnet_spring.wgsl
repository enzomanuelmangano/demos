// Magnet Spring (src/animations/magnet-spring/magnet.tsx): nine magnets and the dragged piece,
// each a circle over its box shadow, in the views' order, on #f5f5f5. A box shadow of a circle
// is radially symmetric, and a view's scale scales it whole (radius, blur and offset), so each
// is one profile, sampled at the distance in the view's own points: the coverage of the circle
// blurred by its σ, worked out once on the CPU.
struct Items {
    // Each magnet: centre (points), scale, unused. The piece last.
    at: array<vec4<f32>, 10>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

struct Profiles {
    // The magnet's shadow (r 10, σ 10) every 0.5 pt from its centre, four to a vec4.
    magnet: array<vec4<f32>, 32>,
    // The piece's (r 25, σ 5), the same way.
    piece: array<vec4<f32>, 32>,
};

@group(0) @binding(0) var<uniform> u: Items;
@group(0) @binding(1) var<uniform> profiles: Profiles;

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

const STEP: f32 = 0.5;

fn magnet_at(i: u32) -> f32 { return profiles.magnet[i / 4u][i % 4u]; }
fn piece_at(i: u32) -> f32 { return profiles.piece[i / 4u][i % 4u]; }

// A profile at distance `d` (points), linearly between its samples; 0 past the last.
fn magnet_shadow(d: f32) -> f32 {
    let x = d / STEP;
    let i = u32(floor(x));
    if (i >= 127u) { return 0.0; }
    return mix(magnet_at(i), magnet_at(i + 1u), fract(x));
}
fn piece_shadow(d: f32) -> f32 {
    let x = d / STEP;
    let i = u32(floor(x));
    if (i >= 127u) { return 0.0; }
    return mix(piece_at(i), piece_at(i + 1u), fract(x));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let px = u.canvas.z;
    let p = in.uv * u.canvas.xy / px;
    var c = vec3<f32>(245.0, 245.0, 245.0) / 255.0;
    // The magnets: boxShadow 0 0 20 rgba(0,0,0,0.1), #c1c1c1, radius 10, each scaled.
    for (var i = 0u; i < 9u; i = i + 1u) {
        let m = u.at[i];
        let d = distance(p, m.xy);
        c = c * (1.0 - 0.1 * magnet_shadow(d / m.z));
        let cover = clamp((10.0 * m.z - d) * px + 0.5, 0.0, 1.0);
        c = mix(c, vec3<f32>(193.0, 193.0, 193.0) / 255.0, cover);
    }
    // The piece: boxShadow 0 2 10 rgba(0,0,0,0.2), #3b3b3b, radius 25, scaled.
    let m = u.at[9];
    let ds = distance(p, m.xy + vec2<f32>(0.0, 2.0 * m.z));
    c = c * (1.0 - 0.2 * piece_shadow(ds / m.z));
    let cover = clamp((25.0 * m.z - distance(p, m.xy)) * px + 0.5, 0.0, 1.0);
    c = mix(c, vec3<f32>(59.0, 59.0, 59.0) / 255.0, cover);
    if (u.canvas.w > 0.5) { c = to_linear(c); }
    return vec4<f32>(c, 1.0);
}

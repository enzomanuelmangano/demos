// Atlas Button (src/animations/atlas-button/atlas-button/animated-squares.tsx): the <Atlas> of
// HSquares × VSquares sprites of a white texture, each under RSXform(scale, 0, x, y) with its
// colour blended in (colorBlendMode DstOver: the colour over the white sprite), not
// antialiased (drawAtlas draws its quads plain). The useRSXformBuffer worklet runs here, per
// instance; the whole button is scaled about its centre (rStyle). Then the icon and label
// layer (`layer`, drawn by packages/skia) over it.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // SquareContainerSize, HSquares, SquareSize, activeRadius.
    grid: vec4<f32>,
    // The button's scale, its centre (points), unused.
    view: vec4<f32>,
};

// Per square: its colour (opaque, straight sRGB) with, in w, its random value.
struct Square {
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> squares: array<Square>;
@group(0) @binding(2) var layer: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

struct Sprite {
    @builtin(position) pos: vec4<f32>,
    @location(0) @interpolate(flat) color: vec3<f32>,
};

@vertex
fn square_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Sprite {
    let columns = u32(u.grid.y);
    let c = u.grid.x;
    let t = vec2<f32>(f32(i % columns) * c, f32(i / columns) * c);
    let distance = length(t - u.view.yz);
    let radius = max(u.grid.w, 1e-3);
    let scale = max(0.0, 1.5 - distance / radius);
    let sq = squares[i];
    let corner = array<vec2<f32>, 6>(vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0))[v];
    let at = t + corner * u.grid.z * scale;
    let p = (u.view.yz + (at - u.view.yz) * u.view.x) * u.canvas.z;
    var o: Sprite;
    o.pos = vec4<f32>(p.x / u.canvas.x * 2.0 - 1.0, 1.0 - p.y / u.canvas.y * 2.0, 0.0, 1.0);
    // scale >= 0.9 + random × 0.5: set(0, 0, 0, 0), nothing drawn.
    if (scale >= 0.9 + sq.color.w * 0.5 || scale <= 0.0) { o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0); }
    o.color = sq.color.rgb;
    return o;
}

@fragment
fn square_fs(in: Sprite) -> @location(0) vec4<f32> {
    var rgb = in.color;
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb, 1.0);
}

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn layer_vs(@builtin(vertex_index) i: u32) -> Out {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    var o: Out;
    o.pos = vec4<f32>(q, 0.0, 1.0);
    o.uv = vec2<f32>(q.x * 0.5 + 0.5, 0.5 - q.y * 0.5);
    return o;
}

// The layer is premultiplied, already in the target's encoding.
@fragment
fn layer_fs(in: Out) -> @location(0) vec4<f32> {
    return textureSampleLevel(layer, smp, in.uv, 0.0);
}

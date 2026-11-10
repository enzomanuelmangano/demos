// Atlas Sphere (src/animations/atlas-sphere/atlas-sphere.tsx): the <Atlas> of a grid of 3-pt
// sprites, each a texel-for-pixel copy of BASE_SQUARE (a #00f7ff circle of r 1.5 at (1.5, 1.5),
// drawn by useTexture into a SQUARE_CONTAINER_SIZE-pixel image) under its RSXform(scale, 0,
// x, y). The useAnimatedReaction that writes the transforms runs here, per instance; the
// sprite is read back linearly filtered (drawAtlas's default sampling) from its 4 × 4 texels.
struct Uniforms {
    // The canvas in device pixels (w, h), device pixels per point, whether the target encodes
    // sRGB itself (1).
    canvas: vec4<f32>,
    // SQUARE_CONTAINER_SIZE, SQUARES_AMOUNT_HORIZONTAL, SCALE_DISTANCE, unused.
    grid: vec4<f32>,
    // The touched point (x, y), progress, whether a point was ever touched (1).
    touch: vec4<f32>,
    // The texture's texels (0, 0) to (3, 3), row by row: the circle's coverage (texel 3 is
    // outside it).
    texels: array<vec4<f32>, 4>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

const MAX_SCALE: f32 = 1.0;
const MIN_SCALE: f32 = 0.1;
const SQUARE_SIZE: f32 = 3.0;
// BASE_SQUARE's color, #00f7ffff.
const COLOR: vec3<f32> = vec3<f32>(0.0, 247.0 / 255.0, 1.0);

struct Sprite {
    @builtin(position) pos: vec4<f32>,
    // The sprite's own coordinates (0 to SQUARE_SIZE).
    @location(0) local: vec2<f32>,
};

@vertex
fn sprite_vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> Sprite {
    let columns = u32(u.grid.y);
    let c = u.grid.x;
    let t = vec2<f32>(f32(i % columns) * c, f32(i / columns) * c);
    let progress = u.touch.z;
    let d = select(vec2<f32>(0.0), u.touch.xy - t, u.touch.w > 0.5);
    let progressive = length(d) * progress;
    let sd = u.grid.z;
    let scale = select(MAX_SCALE + (progressive / sd) * (MIN_SCALE - MAX_SCALE), MIN_SCALE, progressive > sd);
    let corner = array<vec2<f32>, 6>(vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0), vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0))[v];
    let local = corner * SQUARE_SIZE;
    let at = t + d * (1.0 - scale) * progress * progress + local * scale;
    let p = at * u.canvas.z;
    var o: Sprite;
    o.pos = vec4<f32>(p.x / u.canvas.x * 2.0 - 1.0, 1.0 - p.y / u.canvas.y * 2.0, 0.0, 1.0);
    // scale <= MIN_SCALE: set(0, 0, 0, 0), nothing drawn.
    if (scale <= MIN_SCALE) { o.pos = vec4<f32>(2.0, 2.0, 0.0, 1.0); }
    o.local = local;
    return o;
}

fn texel(x: i32, y: i32) -> f32 {
    let cx = clamp(x, 0, 3);
    let cy = clamp(y, 0, 3);
    return u.texels[cy][cx];
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn sprite_fs(in: Sprite) -> @location(0) vec4<f32> {
    let tc = in.local - vec2<f32>(0.5);
    let i0 = vec2<i32>(floor(tc));
    let f = tc - floor(tc);
    let top = mix(texel(i0.x, i0.y), texel(i0.x + 1, i0.y), f.x);
    let bottom = mix(texel(i0.x, i0.y + 1), texel(i0.x + 1, i0.y + 1), f.x);
    let a = mix(top, bottom, f.y);
    var rgb = COLOR;
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    return vec4<f32>(rgb * a, a);
}

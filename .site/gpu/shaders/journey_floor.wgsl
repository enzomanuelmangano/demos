// The board under the Journey's road (src/components/journey/board-floor.tsx, its SkSL line for
// line): a pinhole camera over a checker plane, fading out above a third of the screen and to the
// sides, drifting at a quarter of the road's speed. Premultiplied, in the target's encoding.
struct Floor {
    // size (points), scroll, strength
    a: vec4<f32>,
    // tint rgb, horizon
    b: vec4<f32>,
    // across, depthScale, points per pixel, srgb target
    c: vec4<f32>,
};
@group(0) @binding(0) var<uniform> f: Floor;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn fs(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = pos.xy * f.c.z;
    let uv = p / f.a.xy;
    let horizon = f.b.w;
    let dist = 1.0 / (uv.y + horizon);
    let x = (uv.x - 0.5) * dist * f.c.x * (1.0 + horizon);
    let y = dist * f.c.y - f.a.z;
    let cell = (floor(x) + floor(y)) - 2.0 * floor((floor(x) + floor(y)) / 2.0);
    var near = smoothstep(0.2, 1.0, uv.y);
    near = near * near;
    let side = 1.0 - smoothstep(0.15, 0.5, abs(uv.x - 0.5));
    let a = cell * f.a.w * near * (0.2 + 0.8 * side);
    var rgb = f.b.rgb;
    if (f.c.w > 0.5) { rgb = lin(rgb); }
    return vec4<f32>(rgb * a, a);
}

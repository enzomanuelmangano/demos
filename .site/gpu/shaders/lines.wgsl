// The offer board's white linework at a fixed width on screen, as RN redraws it
// (mascot-scene-core.ts replaceBoardLinework: three's LineSegments2, 0.6 pt, not world units):
// each segment a quad around its two clip-space ends, widened across the screen.
struct Lines {
    // segment ends in clip space: a, b for each of up to 16 segments
    ends: array<vec4<f32>, 32>,
    // target width, height (pixels), line width (pixels), segments
    view: vec4<f32>,
    // the line's colour, linear
    color: vec4<f32>,
}

@group(0) @binding(0) var<uniform> l: Lines;

@vertex
fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> @builtin(position) vec4<f32> {
    let a = l.ends[i * 2u];
    let b = l.ends[i * 2u + 1u];
    // The corner: 0 and 1 along the segment, -1 and 1 across it.
    var along = array<f32, 6>(0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
    var side = array<f32, 6>(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
    let sa = a.xy / a.w * l.view.xy * 0.5;
    let sb = b.xy / b.w * l.view.xy * 0.5;
    let dir = normalize(sb - sa + vec2<f32>(1e-6, 0.0));
    let normal = vec2<f32>(-dir.y, dir.x);
    let p = select(a, b, along[v] > 0.5);
    let offset = normal * side[v] * l.view.z * 0.5 / (l.view.xy * 0.5);
    return vec4<f32>(p.xy + offset * p.w, p.z, p.w);
}

@fragment
fn fs() -> @location(0) vec4<f32> {
    return l.color;
}

// The scheme probe: the centre of a captured child (a dot of the page's colour)
// copied into a 1x1 target for reading back (src/probe.rs).
@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4<f32> {
    return textureSampleLevel(src, smp, vec2<f32>(0.5, 0.5), 0.0);
}

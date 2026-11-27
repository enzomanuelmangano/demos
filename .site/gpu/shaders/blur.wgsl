// The wave's blur pyramid (onboarding/wave-pyramid.ts): the snapshot, with the
// bands left out of the frost painted the page's colour (checkmate-aura.tsx
// `eraseBands`), halved with linear filtering, then blurred by a separable
// Gaussian at the sigma the level is drawn at (sigma = the disk's radius / 2).
struct Blur {
    // source size in pixels (xy), this pass's target size in pixels (zw)
    size: vec4<f32>,
    // erase: the top band ends and the bottom band starts (source uv y), and
    // the colour painted over them comes from `probe` (1) or nothing (0); sigma
    // in target pixels
    erase: vec4<f32>,
    // the Gaussian's step in source uv (xy); 1 on the downsampling pass (z)
    step: vec4<f32>,
    // the page's colour, dark (rgb) and light (rgb), and the probe's uv
    base_dark: vec4<f32>,
    base_light: vec4<f32>,
    probe: vec4<f32>,
}

@group(0) @binding(0) var<uniform> b: Blur;
@group(0) @binding(1) var src: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    return vec4<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1), 0.0, 1.0);
}

fn base() -> vec3<f32> {
    let p = textureSampleLevel(src, smp, b.probe.xy, 0.0).rgb;
    let light = dot(p, vec3<f32>(0.2126, 0.7152, 0.0722)) > 0.5;
    return select(b.base_dark.rgb, b.base_light.rgb, light);
}

// Halve: a linear sample at exactly half the size averages a 2x2 block; the
// erased bands are the page's ground, not the controls they held.
@fragment
fn down(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / b.size.zw;
    let c = textureSampleLevel(src, smp, uv, 0.0);
    if (b.erase.z > 0.5 && (uv.y < b.erase.x || uv.y > b.erase.y)) {
        return vec4<f32>(base(), 1.0);
    }
    return c;
}

// One axis of the Gaussian, out to three sigma.
@fragment
fn gauss(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let uv = pos.xy / b.size.zw;
    let sigma = max(b.erase.w, 0.5);
    let r = i32(ceil(sigma * 3.0));
    var acc = vec4<f32>(0.0);
    var wsum = 0.0;
    for (var i = -r; i <= r; i = i + 1) {
        let x = f32(i);
        let w = exp(-(x * x) / (2.0 * sigma * sigma));
        acc = acc + textureSampleLevel(src, smp, uv + b.step.xy * x, 0.0) * w;
        wsum = wsum + w;
    }
    return acc / wsum;
}

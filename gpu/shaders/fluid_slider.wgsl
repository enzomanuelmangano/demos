// Fluid Slider (src/animations/fluid-slider): the canvas as RN Skia and Core Animation show it.
// `goo` is Graphite's blur (draw2d::blur::GraphiteBlur) of the Group layer (the bar and the
// metaball, #007AFF, premultiplied encoded Display P3 in 8 bits); the layer's ColorMatrix runs on
// it unpremultiplied (RGB kept, alpha 50 a − 25, clamped). `top` is what is drawn over the layer
// (the white circle and the value), premultiplied P3. The two land in the canvas's 8-bit P3
// surface, cleared transparent. Core Animation moves that surface by the view's translateX as a
// bitmap (bilinear: two canvas pixels per screen pixel at a half-pixel shift), converts it to sRGB
// per pixel unpremultiplied and lays it over the screen's #f8f9fa (which the Contract view
// draws: the output here is premultiplied).
struct Uniforms {
    // The canvas (device px), whether the target encodes sRGB itself, the translateX (device px).
    canvas: vec4<f32>,
    // The blurred image: uv = p · low.xy + low.zw (p in canvas px).
    low: vec4<f32>,
    // The blur result's bounds (ltrb, canvas px): transparent outside.
    out: vec4<f32>,
    // .x: 1 when there is a blur; .y, .z: the ColorMatrix's alpha row (scale, bias).
    layer: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var goo: texture_2d<f32>;
@group(0) @binding(2) var top: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded Display P3 to encoded sRGB (clipped to the sRGB gamut).
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b));
}
// An 8-bit surface's store.
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}

// The canvas's pixel `ip`: premultiplied encoded P3, as stored.
fn canvas_px(ip: vec2<i32>) -> vec4<f32> {
    if (any(ip < vec2<i32>(0)) || any(vec2<f32>(ip) >= u.canvas.xy)) {
        return vec4<f32>(0.0);
    }
    let p = vec2<f32>(ip) + vec2<f32>(0.5);
    var g = vec4<f32>(0.0);
    if (u.layer.x > 0.5 && all(p >= u.out.xy) && all(p <= u.out.zw)) {
        g = textureSampleLevel(goo, smp, p * u.low.xy + u.low.zw, 0.0);
    }
    var rgb = vec3<f32>(0.0);
    if (g.a > 0.0) { rgb = g.rgb / g.a; }
    let a = clamp(u.layer.y * g.a + u.layer.z, 0.0, 1.0);
    let layer = q8(vec4<f32>(rgb * a, a));
    let t = textureLoad(top, ip, 0);
    return q8(t + layer * (1.0 - t.a));
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    // Bilinear at the shift: the screen pixel's centre is canvas x = pos.x − shift.
    let x = in.pos.x - u.canvas.w - 0.5;
    let x0 = floor(x);
    let f = x - x0;
    let y = i32(floor(in.pos.y));
    let c = mix(canvas_px(vec2<i32>(i32(x0), y)), canvas_px(vec2<i32>(i32(x0) + 1, y)), f);
    var rgb = vec3<f32>(0.0);
    if (c.a > 0.0) { rgb = p3_to_srgb(c.rgb / c.a); }
    if (u.canvas.z > 0.5) { rgb = lin(rgb); }
    return vec4<f32>(rgb * c.a, c.a);
}

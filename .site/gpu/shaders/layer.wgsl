// A flat layer of the intro, composited by the stage's surface in canvas points: a texture
// (the stage's own drawing, or a piece of copy the host rasterised once) at a rect with an
// opacity, or a pill (a story dot) in a colour. Premultiplied.
struct Layer {
    // x, y, width, height in canvas points
    rect: vec4<f32>,
    // canvas width, height (points), kind (0 a texture, 1 a pill), opacity
    view: vec4<f32>,
    // a pill's colour, premultiplied encoded sRGB
    color: vec4<f32>,
    // 1 on an sRGB target
    misc: vec4<f32>,
}

@group(0) @binding(0) var<uniform> l: Layer;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

struct Out {
    @builtin(position) pos: vec4<f32>,
    @location(0) uv: vec2<f32>,
}

@vertex
fn vs(@builtin(vertex_index) v: u32) -> Out {
    var corners = array<vec2<f32>, 6>(
        vec2<f32>(0.0, 0.0), vec2<f32>(1.0, 0.0), vec2<f32>(0.0, 1.0),
        vec2<f32>(1.0, 0.0), vec2<f32>(1.0, 1.0), vec2<f32>(0.0, 1.0),
    );
    // A pill reaches a point past its box, for its edge's antialiasing.
    let m = select(0.0, 1.0, l.view.z > 0.5);
    let c = corners[v];
    let p = l.rect.xy - vec2<f32>(m) + c * (l.rect.zw + vec2<f32>(2.0 * m));
    var o: Out;
    o.pos = vec4<f32>(p.x / l.view.x * 2.0 - 1.0, 1.0 - p.y / l.view.y * 2.0, 0.0, 1.0);
    o.uv = (p - l.rect.xy) / l.rect.zw;
    return o;
}

fn out(c: vec4<f32>) -> vec4<f32> {
    if (l.misc.x < 0.5 || c.a <= 0.0) {
        return c;
    }
    let s = c.rgb / c.a;
    let lin = select(pow((s + 0.055) / 1.055, vec3<f32>(2.4)), s / 12.92, s <= vec3<f32>(0.04045));
    return vec4<f32>(lin * c.a, c.a);
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    let texel = textureSample(tex, smp, clamp(in.uv, vec2<f32>(0.0), vec2<f32>(1.0)));
    // The pill: a rounded rect of radius half its height, in points.
    let half = l.rect.zw * 0.5;
    let q = abs(in.uv * l.rect.zw - half) - (half - vec2<f32>(half.y));
    let d = length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - half.y;
    let w = max(fwidth(d), 1e-4);
    let pill = clamp(0.5 - d / w, 0.0, 1.0);
    // A texture layer passes its own pixels through untouched (it is pre-encoded); only the
    // pill is converted for an sRGB target.
    if (l.view.z > 0.5) {
        return out(l.color * (pill * l.view.w));
    }
    return texel * l.view.w;
}

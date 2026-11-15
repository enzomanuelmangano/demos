// Delete Button (src/animations/delete-button): the pill and the close circle, merged
// analytically. RN melts them with a gooey layer (Blur 10, alpha × 18 − 10), which at rest leaves
// soft, smeared edges; here each shape is a signed distance (the pill Skia's RoundedRect r 20,
// circular corners; the circle, its radius already shrunk by its opacity as the threshold would),
// joined by a polynomial smooth minimum whose k the surface animates (0 once they part: two crisp
// shapes) and covered with one pixel of analytic anti-aliasing. What the canvas draws after the
// layer (the labels, the cross) is `top`, over it. One pass: no blur, no threshold, no residue.
struct Uniforms {
    // The pill (points, after its group's scale): centre x, y, half width, half height.
    rect: vec4<f32>,
    // The pill's corner radius, the circle's centre x, y and (effective) radius.
    shape: vec4<f32>,
    // The smooth minimum's k (points), device pixels per point, whether the target encodes
    // sRGB itself (the shader writes linear), unused.
    merge: vec4<f32>,
    // deleteButtonColor (the canvas's encoding), unused.
    color: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var top: texture_2d<f32>;

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

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// A rounded rect with circular corners (Skia's rrect), centred at `c`.
fn rrect(p: vec2<f32>, c: vec2<f32>, half: vec2<f32>, r: f32) -> f32 {
    let q = abs(p - c) - half + vec2<f32>(r);
    return length(max(q, vec2<f32>(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

// The polynomial smooth minimum: within k of each other the two distances blend into a neck.
fn smin(a: f32, b: f32, k: f32) -> f32 {
    if (k <= 0.0) { return min(a, b); }
    let h = max(k - abs(a - b), 0.0) / k;
    return min(a, b) - h * h * k * 0.25;
}

@fragment
fn compose(in: Out) -> @location(0) vec4<f32> {
    let p = in.pos.xy / u.merge.y;
    let pill = rrect(p, u.rect.xy, u.rect.zw, u.shape.x);
    let circle = length(p - u.shape.yz) - u.shape.w;
    let d = smin(pill, circle, u.merge.x);
    // One device pixel of coverage across the edge.
    let a = clamp(0.5 - d / max(fwidth(d), 1e-4), 0.0, 1.0);
    // Skia blends in the canvas's encoded space: `top` (premultiplied) over the shapes.
    let t = textureLoad(top, vec2<i32>(in.pos.xy), 0);
    var c = vec4<f32>(t.rgb + u.color.rgb * a * (1.0 - t.a), t.a + a * (1.0 - t.a));
    if (u.merge.z > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}

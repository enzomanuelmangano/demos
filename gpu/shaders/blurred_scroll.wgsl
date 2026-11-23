// Blurred Scroll (src/animations/blurred-scroll/components/BlurredItem.tsx). Each item is an
// Animated.View rotated about its centre holding a Skia canvas (an 8-bit Display P3 surface,
// cleared transparent) whose Group scales about (width / 2, 0); inside, a white RoundedRect in a
// Blur layer, then a Fill of LinearGradient((0, 0) → (width, itemHeight), #9459F4 → #3411E4)
// with srcIn.
//
// `compose`: the item's canvas, texel for texel: `layer` is the blurred layer as Skia drew it
// back into the canvas (8-bit white × coverage); srcIn keeps the gradient (mixed in Display P3)
// at that coverage, stored in 8 bits.
// `item`: the canvas on screen as Core Animation shows it under the View's rotate: its backing
// store sampled bilinearly, the quad's edges aliased (a pixel is in when its centre is), each
// pixel converted to sRGB unpremultiplied and laid over what is below.
struct Item {
    // The view's centre on screen (device px), cos and sin of its rotation.
    view: vec4<f32>,
    // The canvas (device px: width, height), the Group's scale, device px per point.
    item: vec4<f32>,
    // The gradient's end point (points, from (0, 0)), the target (device px).
    canvas: vec4<f32>,
    // The gradient's colours as encoded Display P3; .w of c0: the target encodes sRGB itself.
    c0: vec4<f32>,
    c1: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Item;
@group(0) @binding(1) var layer: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn lin(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}
fn enc(c0: vec3<f32>) -> vec3<f32> {
    let c = clamp(c0, vec3<f32>(0.0), vec3<f32>(1.0));
    return select(1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055, c * 12.92, c <= vec3<f32>(0.0031308));
}
// Encoded Display P3 to encoded sRGB.
fn p3_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let l = lin(c);
    return enc(vec3<f32>(
        1.2249401 * l.r - 0.2249404 * l.g,
        -0.0420569 * l.r + 1.0420571 * l.g,
        -0.0196376 * l.r - 0.0786361 * l.g + 1.0982735 * l.b));
}
fn q8(c: vec4<f32>) -> vec4<f32> {
    return round(clamp(c, vec4<f32>(0.0), vec4<f32>(1.0)) * 255.0) / 255.0;
}

@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let a = textureLoad(layer, vec2<i32>(pos.xy), 0).a;
    // The Fill's gradient in the Group's space: scale g about (width / 2, 0).
    let s = u.item.w;
    let p = pos.xy / s;
    let g = u.item.z;
    let half = u.item.x / s * 0.5;
    let q = vec2<f32>((p.x - half) / g + half, p.y / g);
    let e = u.canvas.xy;
    let t = clamp(dot(q, e) / dot(e, e), 0.0, 1.0);
    let rgb = mix(u.c0.rgb, u.c1.rgb, t);
    return q8(vec4<f32>(rgb * a, a));
}

@fragment
fn item(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let size = u.item.xy;
    // Screen → the view's own pixels (RN's rotate is clockwise on screen).
    let d = pos.xy - u.view.xy;
    let local = vec2<f32>(u.view.z * d.x + u.view.w * d.y, -u.view.w * d.x + u.view.z * d.y) + size * 0.5;
    if (any(local < vec2<f32>(0.0)) || any(local >= size)) { discard; }
    let c = textureSampleLevel(layer, smp, local / vec2<f32>(textureDimensions(layer)), 0.0);
    if (c.a <= 0.0) { discard; }
    var rgb = p3_to_srgb(c.rgb / c.a);
    if (u.c0.w > 0.5) { rgb = lin(rgb); }
    return vec4<f32>(rgb * c.a, c.a);
}

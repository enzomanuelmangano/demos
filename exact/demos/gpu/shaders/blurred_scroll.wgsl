// Blurred Scroll (src/animations/blurred-scroll/components/BlurredItem.tsx): one list item,
// drawn over what the items before it drew. The item is an Animated.View rotated about its
// centre holding a Skia canvas (width × itemHeight, which clips) whose Group scales about
// (width / 2, 0); inside, a white RoundedRect (inset 60, r 20) in a layer under Blur, and a
// Fill of LinearGradient((0, 0) → (width, itemHeight), #9459F4 → #3411E4) with srcIn over it:
// the gradient's colour at the blurred rect's coverage.
//
// `layer` is the white rect drawn in the canvas's own space (its Group's scale applied) and
// blurred; where the blur is Skia's 0.1 (sharp), the rect's coverage is computed here instead.
struct Item {
    // The view's centre on screen (points), cos and sin of its rotation.
    view: vec4<f32>,
    // The canvas's width and height (points), the Group's scale, 1 when `layer` holds it.
    item: vec4<f32>,
    // The target (device pixels), device pixels per point, whether the target encodes sRGB.
    canvas: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Item;
@group(0) @binding(1) var layer: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

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

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// A rounded rect's signed distance (negative inside).
fn rrect(p: vec2<f32>, origin: vec2<f32>, size: vec2<f32>, r: f32) -> f32 {
    let half = size * 0.5;
    let d = abs(p - origin - half) - half + vec2<f32>(r);
    return length(max(d, vec2<f32>(0.0))) + min(max(d.x, d.y), 0.0) - r;
}

@fragment
fn item(in: Out) -> @location(0) vec4<f32> {
    let s = u.canvas.z;
    let size = u.item.xy;
    let p = in.uv * u.canvas.xy / s;
    // Screen → the view's own space (RN's rotate is clockwise on screen).
    let d = p - u.view.xy;
    let local = vec2<f32>(u.view.z * d.x + u.view.w * d.y, -u.view.w * d.x + u.view.z * d.y) + size * 0.5;
    // The canvas clips to its box.
    let inside = min(min(local.x, size.x - local.x), min(local.y, size.y - local.y));
    let clip = clamp(inside * s + 0.5, 0.0, 1.0);
    if (clip <= 0.0) { discard; }
    // The Group: scale about (width / 2, 0).
    let g = u.item.z;
    let q = vec2<f32>((local.x - size.x * 0.5) / g + size.x * 0.5, local.y / g);
    var cover: f32;
    if (u.item.w > 0.5) {
        cover = textureSampleLevel(layer, smp, local / size, 0.0).a;
    } else {
        // horizontalPadding / verticalPadding 120: the rect inset 60, radius 20.
        let dist = rrect(q, vec2<f32>(60.0), size - vec2<f32>(120.0), 20.0) * g;
        cover = clamp(0.5 - dist * s, 0.0, 1.0);
    }
    let t = clamp(dot(q, size) / dot(size, size), 0.0, 1.0);
    var rgb = mix(vec3<f32>(148.0, 89.0, 244.0), vec3<f32>(52.0, 17.0, 228.0), t) / 255.0;
    if (u.canvas.w > 0.5) { rgb = to_linear(rgb); }
    let a = cover * clip;
    return vec4<f32>(rgb * a, a);
}

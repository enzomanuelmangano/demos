// Fourier Visualizer (src/animations/fourier-visualizer/index.tsx): the clear button's view at
// its opacity. Core Animation draws a view with opacity < 1 as a group (allowsGroupOpacity): the
// #111 disc and the white icon are rendered into their own layer (premultiplied, encoded sRGB,
// by packages/skia), and the layer is laid over the canvas at the view's opacity, src-over.
struct Uniforms {
    // The layer's top-left corner in the target (device pixels), the view's opacity, and
    // whether the target encodes sRGB itself (1).
    place: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var button: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

// The layer's texel under this pixel (pixel for pixel: the layer sits on the pixel grid), times
// the opacity; blended premultiplied over the canvas.
@fragment
fn compose(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    let p = vec2<i32>(floor(pos.xy - u.place.xy));
    let size = vec2<i32>(textureDimensions(button));
    if (any(p < vec2<i32>(0)) || any(p >= size)) {
        return vec4<f32>(0.0);
    }
    var c = textureLoad(button, p, 0) * u.place.z;
    if (u.place.w > 0.5 && c.a > 0.0) {
        c = vec4<f32>(to_linear(c.rgb / c.a) * c.a, c.a);
    }
    return c;
}

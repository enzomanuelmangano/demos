// Cherry Blossom QR Code: the react-native-webgpu canvas as Core Animation shows it. The scene
// (cherry_blossom_qrcode.wgsl) is drawn into an 8-bit layer of canvas.width × canvas.height
// pixels (the drawable the demo sizes: canvasWidth and canvasHeight × PixelRatio, truncated to
// integers by the JSI), whose values are sRGB as written (a bgra8unorm CAMetalLayer with no
// colorspace). CAMetalLayer's contentsGravity resize stretches that drawable over the view's
// device pixels with its linear filter; where both sizes agree, a pixel is its texel.
struct Compose {
    // The layer's size (px w, h), the canvas's (px w, h).
    size: vec4<f32>,
    // 1 when the target encodes sRGB itself (write linear), 1 when the sizes agree.
    flags: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Compose;
@group(0) @binding(1) var layer: texture_2d<f32>;
@group(0) @binding(2) var smp: sampler;

@vertex
fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4<f32> {
    let q = vec2<f32>(f32(i32(i & 1u) * 4 - 1), f32(i32(i >> 1u) * 4 - 1));
    return vec4<f32>(q, 0.0, 1.0);
}

fn to_linear(c: vec3<f32>) -> vec3<f32> {
    return select(pow((c + 0.055) / 1.055, vec3<f32>(2.4)), c / 12.92, c <= vec3<f32>(0.04045));
}

@fragment
fn fs(@builtin(position) p: vec4<f32>) -> @location(0) vec4<f32> {
    var c: vec4<f32>;
    if (u.flags.y > 0.5) {
        c = textureLoad(layer, vec2<i32>(p.xy), 0);
    } else {
        c = textureSampleLevel(layer, smp, p.xy / u.size.zw, 0.0);
    }
    if (u.flags.x > 0.5) {
        return vec4<f32>(to_linear(c.rgb), c.a);
    }
    return c;
}

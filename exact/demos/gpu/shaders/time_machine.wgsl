// Time Machine (src/animations/time-machine): the background canvas's RuntimeEffect (shader.ts,
// P_Malin's starfield as RN adapted it), line for line, then the two compositing passes the
// surface needs: the Blur image filter's low-resolution result read back up, and a card group
// (Core Animation's group opacity) blended over what is under it.
//
// The starfield is grey (every channel the same value), so RN Skia's Display P3 surface encodes
// it as the same 8-bit value sRGB does: no colour conversion.
struct Uniforms {
    // The target in device pixels (w, h), device pixels per point, and whether the target
    // encodes sRGB itself (1: the pass writes linear).
    canvas: vec4<f32>,
    // iResolution (points) and iTime; unused.
    star: vec4<f32>,
    // uv of the blurred image per layer pixel: (kx, ky, ox, oy), uv = p · k + o.
    low: vec4<f32>,
    // The blur's output rect in layer pixels (l, t, r, b): transparent outside.
    output: vec4<f32>,
    // The layer's opacity; unused.
    blend: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var under: texture_2d<f32>;
@group(0) @binding(2) var layer: texture_2d<f32>;
@group(0) @binding(3) var smp: sampler;

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

fn encode(c: vec4<f32>) -> vec4<f32> {
    if (u.canvas.w > 0.5) {
        let rgb = select(pow((c.rgb + 0.055) / 1.055, vec3<f32>(2.4)), c.rgb / 12.92, c.rgb <= vec3<f32>(0.04045));
        return vec4<f32>(rgb, c.a);
    }
    return c;
}

// ---- shader.ts ----

const fBrightness: f32 = 3.5;
const fSteps: f32 = 121.0;
const fParticleSize: f32 = 0.005;
var<private> fParticleLength: f32 = 0.5 / 60.0;
const fMinDist: f32 = 0.8;
const fMaxDist: f32 = 5.0;
const fRepeatMin: f32 = 1.0;
const fRepeatMax: f32 = 2.0;
const fDepthFade: f32 = 0.6;

fn Random(x: f32) -> f32 {
    return fract(sin(x * 123.456) * 23.4567 + sin(x * 345.678) * 45.6789 + sin(x * 456.789) * 56.789);
}

fn RandomColor(seed: f32) -> vec3<f32> {
    let selector = Random(seed + 3.45);
    if (selector < 0.2) { return vec3<f32>(0.9); }
    else if (selector < 0.4) { return vec3<f32>(0.7); }
    else if (selector < 0.6) { return vec3<f32>(0.5); }
    else if (selector < 0.8) { return vec3<f32>(0.3); }
    return vec3<f32>(0.1);
}

fn Twinkle(seed: f32, time: f32) -> f32 {
    let phase = Random(seed) * 6.28318;
    let freq = 0.5 + Random(seed + 0.5) * 2.0;
    return 0.7 + 0.3 * sin(time * freq + phase);
}

fn GetParticleColour(vParticlePos: vec3<f32>, size: f32, vRayDir: vec3<f32>, fSeed: f32) -> vec3<f32> {
    let iTime = u.star.z;
    let vNormDir = normalize(vRayDir.xy);
    let d1 = dot(vParticlePos.xy, vNormDir.xy) / length(vRayDir.xy);
    let vClosest2d = vRayDir * d1;
    var vClampedPos = vParticlePos;
    vClampedPos.z = clamp(vClosest2d.z, vParticlePos.z - fParticleLength, vParticlePos.z + fParticleLength);
    let d = dot(vClampedPos, vRayDir);
    let vClosestPos = vRayDir * d;
    let vDeltaPos = vClampedPos - vClosestPos;
    let particleVariation = 0.5 + Random(fSeed + 10.0) * 1.5;
    let adjustedSize = size * particleVariation;
    let fClosestDist = length(vDeltaPos) / adjustedSize;
    var fShade = clamp(1.0 - fClosestDist, 0.0, 1.0);
    fShade = pow(fShade, 0.8);
    let twinkle = Twinkle(fSeed + 5.0, iTime);
    fShade = fShade * exp2(-d * fDepthFade) * fBrightness * twinkle;
    let particleColor = RandomColor(fSeed);
    var sparkle = 1.0;
    if (fShade > 0.8) {
        sparkle = 1.0 + 2.0 * pow(fShade - 0.8, 2.0) * Twinkle(fSeed + 7.0, iTime * 3.0);
    }
    return particleColor * fShade * sparkle;
}

fn GetParticlePos(vRayDir: vec3<f32>, fZPos: f32, fSeed: f32) -> vec3<f32> {
    let fAngle = atan2(vRayDir.x, vRayDir.y);
    let fAngleFraction = fract(fAngle / (3.14 * 2.0));
    let fSegment = floor(fAngleFraction * fSteps + fSeed) + 0.5 - fSeed;
    let fParticleAngle = fSegment / fSteps * (3.14 * 2.0);
    let fSegmentPos = fSegment / fSteps;
    let fRadius = fMinDist + Random(fSegmentPos + fSeed) * (fMaxDist - fMinDist);
    var tunnelZ = vRayDir.z / length(vRayDir.xy / fRadius);
    tunnelZ += fZPos;
    let fRepeat = fRepeatMin + Random(fSegmentPos + 0.1 + fSeed) * (fRepeatMax - fRepeatMin);
    let fParticleZ = (ceil(tunnelZ / fRepeat) - 0.5) * fRepeat - fZPos;
    return vec3<f32>(sin(fParticleAngle) * fRadius, cos(fParticleAngle) * fRadius, fParticleZ);
}

fn Starfield(vRayDir: vec3<f32>, fZPos: f32, fSeed: f32) -> vec3<f32> {
    let vParticlePos = GetParticlePos(vRayDir, fZPos, fSeed);
    return GetParticleColour(vParticlePos, fParticleSize, vRayDir, fSeed);
}

fn RotateX(vPos: vec3<f32>, fAngle: f32) -> vec3<f32> {
    let s = sin(fAngle);
    let c = cos(fAngle);
    return vec3<f32>(vPos.x, c * vPos.y + s * vPos.z, -s * vPos.y + c * vPos.z);
}

fn RotateY(vPos: vec3<f32>, fAngle: f32) -> vec3<f32> {
    let s = sin(fAngle);
    let c = cos(fAngle);
    return vec3<f32>(c * vPos.x + s * vPos.z, vPos.y, -s * vPos.x + c * vPos.z);
}

fn RotateZ(vPos: vec3<f32>, fAngle: f32) -> vec3<f32> {
    let s = sin(fAngle);
    let c = cos(fAngle);
    return vec3<f32>(c * vPos.x + s * vPos.y, -s * vPos.x + c * vPos.y, vPos.z);
}

// main(fragCoord): RN Skia hands the shader the pixel centre in the canvas's points.
@fragment
fn star(in: Out) -> @location(0) vec4<f32> {
    let iResolution = u.star.xy;
    let iTime = u.star.z;
    let fragCoord = in.pos.xy / u.canvas.z;
    let vScreenUV = fragCoord.xy / iResolution.xy;
    var vScreenPos = vScreenUV * 2.0 - 1.0;
    vScreenPos.x *= iResolution.x / iResolution.y;
    var vRayDir = normalize(vec3<f32>(vScreenPos, 1.0));
    let vEuler = vec3<f32>(
        0.3 + sin(iTime * 0.3) * 0.2,
        0.2 + sin(iTime * 0.16) * 0.3,
        iTime * 0.1 + sin(iTime * 0.24) * 0.8
    );
    vRayDir = RotateX(vRayDir, vEuler.x);
    vRayDir = RotateY(vRayDir, vEuler.y);
    vRayDir = RotateZ(vRayDir, vEuler.z);
    let a = 0.3;
    let b = 8.0;
    let c = 2.4;
    var fZPos = 5.0 + iTime * c + sin(iTime * a) * b;
    let fSpeed = c + a * b * cos(a * iTime);
    fParticleLength = 0.3 * fSpeed / 60.0;
    var fSeed = 0.0;
    // Black background (three mixes of black).
    var vResult = vec3<f32>(0.0);
    for (var i = 0; i < 3; i++) {
        vResult += Starfield(vRayDir, fZPos, fSeed);
        fSeed += 1.234;
        fZPos += 2.0;
    }
    vResult *= 1.0 + 0.1 * sin(iTime * 1.6);
    return encode(vec4<f32>(sqrt(vResult * 1.2), 1.0));
}

// The Blur's result, bilinear from its low-resolution image, decal outside its output; over
// the root View's black (the premultiplied colour, opaque).
@fragment
fn unblur(in: Out) -> @location(0) vec4<f32> {
    let p = in.pos.xy;
    if (p.x < u.output.x || p.y < u.output.y || p.x >= u.output.z || p.y >= u.output.w) {
        return encode(vec4<f32>(0.0, 0.0, 0.0, 1.0));
    }
    let c = textureSampleLevel(layer, smp, p * u.low.xy + u.low.zw, 0.0);
    return encode(vec4<f32>(c.rgb, 1.0));
}

// A card group at its opacity, source-over what is under it (both premultiplied, same size).
@fragment
fn blend(in: Out) -> @location(0) vec4<f32> {
    let q = vec2<i32>(in.pos.xy);
    let d = textureLoad(under, q, 0);
    let s = textureLoad(layer, q, 0) * u.blend.x;
    return encode(s + d * (1.0 - s.a));
}

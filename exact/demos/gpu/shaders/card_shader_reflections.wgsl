// Card Shader Reflections (src/animations/card-shader-reflections/src/components/card-carousel/
// card/card.shader.ts): getCardShader's SkSL, line for line, in f32 as Metal runs it. One card's
// <Canvas> (CARD_WIDTH × CARD_HEIGHT, a <Fill> with the shader) drawn into its own 8-bit layer at
// device pixels: `fragCoord` is the pixel's centre in the canvas's points (Skia's local
// coordinates, y down). The output is stored as the layer stores it (clamped, 8 bits); its values
// are Display P3 (RN Skia's surface), which the compose pass turns into sRGB.
struct Uniforms {
    // rotate (radians, −π…π), cardType (0 Silver, 1 Gold, 2 Platinum, 3 Metal), points per
    // device pixel (the inverse of the canvas's density scale), unused.
    params: vec4<f32>,
    // resolution: [CARD_WIDTH, CARD_HEIGHT]; unused.
    res: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u: Uniforms;

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

const PI: f32 = 3.14159265359;
const BASE_LIGHT_POS: vec3<f32> = vec3<f32>(-3.0, -0.8, 2.5);

// MATERIALS (generateMaterialConstants).
const SILVER_REFLECTIVITY: vec3<f32> = vec3<f32>(0.92, 0.92, 0.92);
const SILVER_EDGE_TINT: vec3<f32> = vec3<f32>(0.94, 0.94, 0.94);
const SILVER_BASE_COLOR: vec3<f32> = vec3<f32>(0.15, 0.15, 0.15);
const SILVER_PRIMARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.9, 0.9, 0.9);
const SILVER_SECONDARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.85, 0.85, 0.85);
const SILVER_ROUGHNESS: f32 = 0.32;
const SILVER_NORMAL_STRENGTH: f32 = 0.2;

const GOLD_REFLECTIVITY: vec3<f32> = vec3<f32>(0.92, 0.88, 0.78);
const GOLD_EDGE_TINT: vec3<f32> = vec3<f32>(0.9, 0.87, 0.82);
const GOLD_BASE_COLOR: vec3<f32> = vec3<f32>(0.16, 0.14, 0.11);
const GOLD_PRIMARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.92, 0.88, 0.78);
const GOLD_SECONDARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.88, 0.85, 0.78);
const GOLD_ROUGHNESS: f32 = 0.32;
const GOLD_NORMAL_STRENGTH: f32 = 0.13;

const PLATINUM_REFLECTIVITY: vec3<f32> = vec3<f32>(0.99, 0.98, 0.97);
const PLATINUM_EDGE_TINT: vec3<f32> = vec3<f32>(1.0, 0.99, 0.98);
const PLATINUM_BASE_COLOR: vec3<f32> = vec3<f32>(0.25, 0.24, 0.23);
const PLATINUM_PRIMARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.99, 0.98, 0.97);
const PLATINUM_SECONDARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.97, 0.96, 0.95);
const PLATINUM_ROUGHNESS: f32 = 0.3;
const PLATINUM_NORMAL_STRENGTH: f32 = 0.14;

const METAL_REFLECTIVITY: vec3<f32> = vec3<f32>(0.96, 0.96, 0.96);
const METAL_EDGE_TINT: vec3<f32> = vec3<f32>(0.98, 0.98, 0.98);
const METAL_BASE_COLOR: vec3<f32> = vec3<f32>(0.18, 0.18, 0.18);
const METAL_PRIMARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.95, 0.95, 0.95);
const METAL_SECONDARY_HIGHLIGHT: vec3<f32> = vec3<f32>(0.92, 0.92, 0.92);
const METAL_ROUGHNESS: f32 = 0.32;
const METAL_NORMAL_STRENGTH: f32 = 0.16;

fn pow2(x: f32) -> f32 { return x * x; }
fn pow2v(x: vec3<f32>) -> vec3<f32> { return x * x; }

fn hash(p: vec2<f32>) -> f32 {
    var p3 = fract(vec3<f32>(p.x, p.y, p.x) * vec3<f32>(443.897, 441.423, 437.195));
    p3 = p3 + dot(p3, p3.yzx + 19.19);
    return fract((p3.x + p3.y) * p3.z);
}

fn noise(p: vec2<f32>) -> f32 {
    let i = floor(p);
    var f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    let a = hash(i);
    let b = hash(i + vec2<f32>(1.0, 0.0));
    let c = hash(i + vec2<f32>(0.0, 1.0));
    let d = hash(i + vec2<f32>(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

fn calculateMetallicDetail(uv: vec2<f32>, cardType: f32) -> f32 {
    let fine = noise(uv * 1600.0) * 0.35;
    let medium = noise(uv * 800.0) * 0.3;
    let rough = noise(uv * 400.0) * 0.2;

    let rotatedUV = vec2<f32>(
        uv.x * cos(PI * 0.15) - uv.y * sin(PI * 0.15),
        uv.x * sin(PI * 0.15) + uv.y * cos(PI * 0.15)
    );
    let directional = noise(rotatedUV * 1000.0) * 0.4;

    let detail = (fine + medium + rough + directional) * 0.4;

    var intensity = 1.1;
    if (cardType < 0.5) {
        intensity = 1.0;
    } else if (cardType < 1.5) {
        intensity = 0.9;
    } else if (cardType < 2.5) {
        intensity = 0.95;
    }
    return detail * intensity;
}

fn calculateNormal(uv: vec2<f32>, c: f32, normalStrength: f32, cardType: f32) -> vec3<f32> {
    let eps = vec2<f32>(1.0) / u.res.xy;

    let r = calculateMetallicDetail(uv + vec2<f32>(eps.x, 0.0), cardType);
    let t = calculateMetallicDetail(uv + vec2<f32>(0.0, eps.y), cardType);

    return normalize(vec3<f32>(
        (r - c) * normalStrength * 2.0,
        (t - c) * normalStrength * 2.0,
        1.0
    ));
}

fn calculateDynamicLight(uv: vec2<f32>, rotationAngle: f32) -> vec3<f32> {
    let baseLight = BASE_LIGHT_POS;
    let c = cos(-rotationAngle);
    let s = sin(-rotationAngle);
    let rotatedLight = vec3<f32>(
        baseLight.x * c - baseLight.z * s,
        baseLight.y,
        baseLight.x * s + baseLight.z * c
    );
    return normalize(rotatedLight);
}

fn calculateEnhancedSpecular(normal: vec3<f32>, viewDir: vec3<f32>, lightDir: vec3<f32>, baseColor: vec3<f32>, roughness: f32, rotationAngle: f32) -> vec3<f32> {
    let halfDir = normalize(lightDir + viewDir);
    let NdotH = max(dot(normal, halfDir), 0.0);
    let NdotV = max(dot(normal, viewDir), 0.0);
    let NdotL = max(dot(normal, lightDir), 0.0);

    let speedFactor = abs(sin(rotationAngle));
    let dynamicRoughness = roughness * (0.6 + speedFactor * 0.4);

    let specPower = (1.0 - dynamicRoughness) * (156.0 + speedFactor * 100.0) + 16.0;
    let specular = pow(NdotH, specPower);

    let rim = pow(1.0 - NdotV, 3.0 + speedFactor * 2.0);

    let fresnel = pow(1.0 - NdotV, 2.5 + speedFactor * 1.5);

    let specIntensity = 1.6 + speedFactor * 0.8;
    let rimIntensity = 0.7 + speedFactor * 0.6;

    return baseColor * (
        specular * specIntensity * pow(NdotL, 1.8) +
        rim * rimIntensity +
        fresnel * 0.8
    ) * (1.0 - dynamicRoughness * 0.4);
}

fn fresnelConductor(cosTheta: f32, reflectivity: vec3<f32>, edgeTint: vec3<f32>) -> vec3<f32> {
    let r = clamp(reflectivity, vec3<f32>(0.0), vec3<f32>(0.99));
    let r_sqrt = sqrt(r);
    let n = mix((1.0 + r_sqrt) / (1.0 - r_sqrt), (1.0 - r) / (1.0 + r), edgeTint);
    var k2 = ((n + 1.0) * (n + 1.0) * r - (n - 1.0) * (n - 1.0)) / (1.0 - r);
    k2 = max(k2, vec3<f32>(0.0));
    let k = sqrt(k2);

    let rs_num = pow2v(n) + pow2v(k) - 2.0 * n * cosTheta + pow2v(vec3<f32>(cosTheta));
    let rs_den = pow2v(n) + pow2v(k) + 2.0 * n * cosTheta + pow2v(vec3<f32>(cosTheta));
    let rs = rs_num / rs_den;

    let rp_num = (pow2v(n) + pow2v(k)) * pow2v(vec3<f32>(cosTheta)) - 2.0 * n * cosTheta + vec3<f32>(1.0);
    let rp_den = (pow2v(n) + pow2v(k)) * pow2v(vec3<f32>(cosTheta)) + 2.0 * n * cosTheta + vec3<f32>(1.0);
    let rp = rp_num / rp_den;

    return clamp(0.5 * (rs + rp), vec3<f32>(0.0), vec3<f32>(1.0));
}

// getMetalProperties: the reflectivity; edgeTint is getEdgeTint.
fn getReflectivity(t: f32) -> vec3<f32> {
    if (t < 0.5) { return SILVER_REFLECTIVITY; }
    if (t < 1.5) { return GOLD_REFLECTIVITY; }
    if (t < 2.5) { return PLATINUM_REFLECTIVITY; }
    return METAL_REFLECTIVITY;
}
fn getEdgeTint(t: f32) -> vec3<f32> {
    if (t < 0.5) { return SILVER_EDGE_TINT; }
    if (t < 1.5) { return GOLD_EDGE_TINT; }
    if (t < 2.5) { return PLATINUM_EDGE_TINT; }
    return METAL_EDGE_TINT;
}

fn getBaseColor(t: f32) -> vec3<f32> {
    if (t < 0.5) { return SILVER_BASE_COLOR; }
    if (t < 1.5) { return GOLD_BASE_COLOR; }
    if (t < 2.5) { return PLATINUM_BASE_COLOR; }
    return METAL_BASE_COLOR;
}

fn getHighlightColor(t: f32, isPrimary: bool) -> vec3<f32> {
    if (t < 0.5) {
        return select(SILVER_SECONDARY_HIGHLIGHT, SILVER_PRIMARY_HIGHLIGHT, isPrimary);
    } else if (t < 1.5) {
        return select(GOLD_SECONDARY_HIGHLIGHT, GOLD_PRIMARY_HIGHLIGHT, isPrimary);
    } else if (t < 2.5) {
        return select(PLATINUM_SECONDARY_HIGHLIGHT, PLATINUM_PRIMARY_HIGHLIGHT, isPrimary);
    }
    return select(METAL_SECONDARY_HIGHLIGHT, METAL_PRIMARY_HIGHLIGHT, isPrimary);
}

// pow(x, 6.0) as Metal's precise pow returns it for any x: an even power (the SkSL's base
// `1.0 - distance * 1.8` goes below 0 near the card's right edge, where RN draws no NaN).
fn pow6(x: f32) -> f32 {
    return pow(abs(x), 6.0);
}

fn envMap(r: vec3<f32>, roughness: f32, t: f32) -> vec3<f32> {
    let envUV = vec2<f32>(atan2(r.z, r.x) / (2.0 * PI) + 0.5, acos(r.y) / PI);

    let light1 = vec2<f32>(0.3, 0.4);
    let light2 = vec2<f32>(0.7, 0.6);

    let intensity1 = pow6(1.0 - distance(envUV, light1) * 1.8);
    let intensity2 = pow6(1.0 - distance(envUV, light2) * 1.8);

    let baseColor = getBaseColor(t);
    let highlight1 = getHighlightColor(t, true);
    let highlight2 = getHighlightColor(t, false);

    var envColor = baseColor +
        highlight1 * intensity1 * 1.6 +
        highlight2 * intensity2 * 1.6;

    let colorShift = pow(1.0 - r.y, 4.0) * 0.8;

    if (t < 0.5) {
        envColor = envColor * vec3<f32>(1.0 + colorShift * 0.05);
    } else if (t < 1.5) {
        envColor = envColor * vec3<f32>(1.0 + colorShift * 0.08, 1.0 + colorShift * 0.06, 1.0 + colorShift * 0.02);
    } else if (t < 2.5) {
        envColor = envColor * vec3<f32>(1.0 + colorShift * 0.06, 1.0 + colorShift * 0.05, 1.0 + colorShift * 0.04);
    } else {
        envColor = envColor * vec3<f32>(1.0 + colorShift * 0.04);
    }

    var mixColor = vec3<f32>(0.35, 0.35, 0.35);
    if (t < 0.5) {
        mixColor = vec3<f32>(0.4, 0.4, 0.45);
    } else if (t < 1.5) {
        mixColor = vec3<f32>(0.45, 0.35, 0.15);
    } else if (t < 2.5) {
        mixColor = vec3<f32>(0.42, 0.41, 0.4);
    }

    return mix(envColor, mixColor, roughness);
}

@fragment
fn fs(in: Out) -> @location(0) vec4<f32> {
    // The canvas's local point: the device pixel's centre through the inverse density scale.
    let fragCoord = in.pos.xy * u.params.z;
    let resolution = u.res.xy;
    let cardType = u.params.y;

    let uv = fragCoord / resolution;
    let viewDir = normalize(vec3<f32>(uv * 2.0 - 1.0, 1.0));

    let rotationAngle = u.params.x;
    let rotationSpeed = abs(sin(rotationAngle));

    let edgeTint = getEdgeTint(cardType);
    let reflectivity = getReflectivity(cardType);
    let baseColor = getBaseColor(cardType);
    var roughness = METAL_ROUGHNESS;
    var strength = METAL_NORMAL_STRENGTH * 1.15;
    if (cardType < 0.5) {
        roughness = SILVER_ROUGHNESS;
        strength = SILVER_NORMAL_STRENGTH * 1.1;
    } else if (cardType < 1.5) {
        roughness = GOLD_ROUGHNESS;
        strength = GOLD_NORMAL_STRENGTH * 1.0;
    } else if (cardType < 2.5) {
        roughness = PLATINUM_ROUGHNESS;
        strength = PLATINUM_NORMAL_STRENGTH * 1.05;
    }

    let lightDir = calculateDynamicLight(uv, rotationAngle);

    let normalStrength = strength * (1.0 + rotationSpeed * 0.15);

    let distortedUV = uv + vec2<f32>(
        sin(rotationAngle * 0.5) * 0.015,
        cos(rotationAngle * 0.7) * 0.015
    );
    let metallicPattern = calculateMetallicDetail(distortedUV, cardType);
    let normal = calculateNormal(distortedUV, metallicPattern, normalStrength, cardType);

    let specular = calculateEnhancedSpecular(normal, viewDir, lightDir, baseColor, roughness, rotationAngle);

    let fresnelBase = max(dot(normal, viewDir), 0.0);
    let fresnelScale = 1.0 + rotationSpeed * 0.4;
    let fresnel = fresnelConductor(fresnelBase, reflectivity * fresnelScale, edgeTint);

    let reflectDir = reflect(-viewDir, normal);
    let envRoughness = roughness * (0.5 + rotationSpeed * 0.3);
    let envColor = envMap(reflectDir, envRoughness, cardType);

    var finalColor = mix(baseColor, envColor, fresnel * (0.8 + rotationSpeed * 0.3));
    finalColor = finalColor * (0.5 + 0.7 * pow(max(dot(normal, lightDir), 0.0), 1.4)) + specular * 1.2;

    finalColor = finalColor * (1.0 + metallicPattern * (0.35 + rotationSpeed * 0.45));

    let contrastBoost = 0.85 + rotationSpeed * 0.2;
    finalColor = pow(finalColor, vec3<f32>(contrastBoost));

    let vignetteCenter = vec2<f32>(
        0.5 + sin(rotationAngle) * 0.15,
        0.5 + cos(rotationAngle * 0.7) * 0.1
    );
    let vignette = 1.0 - length((uv - vignetteCenter) * (1.5 + rotationSpeed * 0.5));
    finalColor = finalColor * mix(0.85, 1.0, vignette);

    let colorShift = sin(rotationAngle * 0.5) * 0.1;
    finalColor = finalColor + vec3<f32>(colorShift, colorShift * 0.5, -colorShift * 0.5) * rotationSpeed * 0.2;

    // The 8-bit layer clamps and rounds it on store.
    return vec4<f32>(finalColor, 1.0);
}

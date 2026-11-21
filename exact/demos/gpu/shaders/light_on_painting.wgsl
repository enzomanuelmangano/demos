// Light on Painting (src/animations/light-on-painting/shaders/relight.ts): the relighting pass,
// line for line. RN draws it with react-native-webgpu into a bgra8unorm CAMetalLayer with no
// colorspace (MetalLayerColorSpace.mm), which iOS shows as sRGB: the output is sRGB-encoded,
// written into an 8-bit layer of RN's raster (light_on_painting_compose.wgsl puts it on screen).
//
// The lighting model is a port of the relighting pass from TypeGPU's `monocular-light-injection`
// example by Konrad Reczko (@reczko_konrad) at Software Mansion: the shadow march, the bulb and
// its halo, the tonemap and the composition are his, constants and all.
//   https://github.com/software-mansion/TypeGPU/tree/main/apps/typegpu-docs/src/examples/image-processing/monocular-light-injection
// Copyright (c) 2025 Software Mansion <swmansion.com>. MIT licensed; see
// https://github.com/software-mansion/TypeGPU/blob/main/LICENSE
//
// World units: 1.0 == a painting's width, which is also one page. The canvas surface is the
// z = 0 plane and the painted scene recedes to surfaceFarZ. Only two paintings can be on screen
// at once, so only two are bound: slot A is the page at `basePage`, slot B the one after it.
//
// RN's Params struct, its members in the same order, packed four to a row (the uniform buffer's
// words are the same; `mode` is a u32 there and a whole f32 here).
struct Params {
    lightColor: vec4<f32>,
    // worldScale.xy: (uv - paintingCenter) * worldScale -> world; paintingCenter.zw: page
    // centre, in screen uv.
    view: vec4<f32>,
    // halfExtentA.xy, halfExtentB.zw: half-size of each slot's painting, world units.
    halfExtent: vec4<f32>,
    // lightPos.xy (world), cordAnchor.zw (world, where the cord is pinned).
    points: vec4<f32>,
    // lightZ, intensity, exposure, relief.
    a: vec4<f32>,
    // specular, shadowStrength, occlusionStrength, surfaceFarZ.
    b: vec4<f32>,
    // mode, cordOpacity, lightReach, shadowLift.
    c: vec4<f32>,
    // pageShift (pages), basePage (slot A's painting), pageCount, bulbOcclusionA.
    d: vec4<f32>,
    // bulbOpacity, bulbExposure (computed once on the CPU), bulbOcclusionB, pad0.
    e: vec4<f32>,
    // The cord's bounding box (min.xy, max.xy), so most pixels can skip it.
    cordBounds: vec4<f32>,
    // The simulated cord, anchor first and bulb last, packed two points per vec4.
    cordNodes: array<vec4<f32>, 6>,
};

const CORD_POINTS = 12u;

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var albedoA: texture_2d<f32>;
@group(0) @binding(2) var surfaceA: texture_2d<f32>;
@group(0) @binding(3) var albedoB: texture_2d<f32>;
@group(0) @binding(4) var surfaceB: texture_2d<f32>;
@group(0) @binding(5) var texSampler: sampler;

fn worldScale() -> vec2<f32> { return params.view.xy; }
fn paintingCenter() -> vec2<f32> { return params.view.zw; }
fn halfExtentA() -> vec2<f32> { return params.halfExtent.xy; }
fn halfExtentB() -> vec2<f32> { return params.halfExtent.zw; }
fn lightPos() -> vec2<f32> { return params.points.xy; }
fn lightZ() -> f32 { return params.a.x; }
fn intensity() -> f32 { return params.a.y; }
fn exposure() -> f32 { return params.a.z; }
fn relief() -> f32 { return params.a.w; }
fn specular() -> f32 { return params.b.x; }
fn shadowStrength() -> f32 { return params.b.y; }
fn occlusionStrength() -> f32 { return params.b.z; }
fn surfaceFarZ() -> f32 { return params.b.w; }
fn mode() -> u32 { return u32(params.c.x); }
fn cordOpacity() -> f32 { return params.c.y; }
fn lightReach() -> f32 { return params.c.z; }
fn shadowLift() -> f32 { return params.c.w; }
fn pageShift() -> f32 { return params.d.x; }
fn basePage() -> f32 { return params.d.y; }
fn pageCount() -> f32 { return params.d.z; }
fn bulbOcclusionA() -> f32 { return params.d.w; }
fn bulbOpacity() -> f32 { return params.e.x; }
fn bulbExposure() -> f32 { return params.e.y; }
fn bulbOcclusionB() -> f32 { return params.e.z; }

const MODE_RELIT: u32 = 0u;
const MODE_ALBEDO: u32 = 1u;
const MODE_DEPTH: u32 = 2u;
const MODE_NORMALS: u32 = 3u;

// --- look constants (kept in step with the upstream relight fragment) --------

const LIGHT_WRAP = 0.25;
// The bulb's glass hangs at lightZ; its light is emitted from this much closer to the viewer.
const LIGHT_LIT_LIFT = 0.34;
const RELIEF_SCALE = 200.0;
const SLOPE_COMPRESSION = 0.55;
const SPECULAR_POWER = 36.0;
const SPECULAR_F0 = 0.06;
const GAMMA = 2.2;
const WHITE_POINT = 2.6;
const HIGHLIGHT_BLEACH = 2.0;
const LUMINANCE_WEIGHTS = vec3<f32>(0.2126, 0.7152, 0.0722);
const AMBIENT_FILL = vec3<f32>(0.62, 0.72, 1.0);
const AMBIENT_REACH = 2.2;
const DITHER_STEP = 1.0 / 255.0;

// Nothing outside a canvas can occlude anything: park it far behind.
const VOID_Z = -32.0;

const SHADOW_STEPS = 16;
const SHADOW_SPAN = 0.3;
const SHADOW_BASELINE = 0.005;
const SHADOW_BIAS = 0.014;
const SHADOW_SLOPE_BIAS = 0.02;
const SHADOW_THICKNESS = 0.7;
const SHADOW_THICKNESS_GROWTH = 2.6;
const SHADOW_SOFTNESS = 0.089;
const SHADOW_GAIN = 2.5;
const SHADOW_FRONT_FADE = 0.2;
const SHADOW_SKIP = 0.02;

const BULB_WORLD_RADIUS = 0.045;
const BULB_CAMERA_Z = 2.0;
const BULB_REFERENCE_Z = 0.42;
const BULB_CORE = 8.0;
const BULB_LIMB = 0.28;
const BULB_EDGE = 0.75;
const BULB_EDGE_FLOOR = 0.004;
const BULB_EDGE_LIMIT = 0.3;
const BULB_HALO = 1.6;
const BULB_HALO_SPAN = 1.2;
const BULB_VEIL = 0.12;
const BULB_VEIL_SPAN = 4.0;
const BULB_ONSET = 0.6;
const BULB_OCCLUSION_SOFT = 0.02;
const BULB_REFERENCE_POWER = 3.2;

const CORD_WIDTH = 0.004;
const CORD_TONE = vec3<f32>(0.20, 0.19, 0.18);
const CORD_GAIN = 0.55;
const CORD_SPECULAR_POWER = 18.0;
const CORD_SPECULAR = 0.16;
const CORD_AMBIENT = 0.12;

// --- plumbing ---------------------------------------------------------------

struct VertexOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) index: u32) -> VertexOutput {
    var corners = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    let corner = corners[index];
    var out: VertexOutput;
    out.position = vec4<f32>(corner, 0.0, 1.0);
    // Flip y so uv (0,0) is the top-left of the canvas, matching the textures.
    out.uv = vec2<f32>((corner.x + 1.0) * 0.5, 1.0 - (corner.y + 1.0) * 0.5);
    return out;
}

fn worldOf(uv: vec2<f32>) -> vec2<f32> {
    return (uv - paintingCenter()) * worldScale();
}

// --- which painting is under this point -------------------------------------

struct Slot {
    local: vec2<f32>,
    half: vec2<f32>,
    useB: bool,
    covered: bool,
};

fn slotAt(world: vec2<f32>) -> Slot {
    let page = round(world.x + pageShift());
    var slot: Slot;
    slot.local = vec2<f32>(world.x - (page - pageShift()), world.y);
    slot.useB = page > basePage() + 0.5;
    slot.half = select(halfExtentA(), halfExtentB(), slot.useB);
    let inFrame = all(abs(slot.local) <= slot.half);
    let realPage = page >= -0.5 && page <= pageCount() - 0.5;
    slot.covered = inFrame && realPage;
    return slot;
}

fn paintingUvOf(slot: Slot) -> vec2<f32> {
    return clamp(slot.local / (slot.half * 2.0) + vec2<f32>(0.5), vec2<f32>(0.0), vec2<f32>(1.0));
}

fn sampleSurface(slot: Slot) -> vec4<f32> {
    let uv = paintingUvOf(slot);
    if (slot.useB) {
        return textureSampleLevel(surfaceB, texSampler, uv, 0.0);
    }
    return textureSampleLevel(surfaceA, texSampler, uv, 0.0);
}

fn sampleAlbedo(slot: Slot) -> vec3<f32> {
    let uv = paintingUvOf(slot);
    if (slot.useB) {
        return textureSampleLevel(albedoB, texSampler, uv, 0.0).rgb;
    }
    return textureSampleLevel(albedoA, texSampler, uv, 0.0).rgb;
}

fn canvasZ(depth: f32) -> f32 {
    return mix(surfaceFarZ(), 0.0, depth);
}

fn sceneZ(world: vec2<f32>) -> f32 {
    let slot = slotAt(world);
    if (!slot.covered) {
        return VOID_Z;
    }
    return canvasZ(sampleSurface(slot).w);
}

// --- shadows ----------------------------------------------------------------

fn dither(uv: vec2<f32>) -> f32 {
    let point = uv * 1024.0;
    return fract(52.9829189 * fract(0.06711056 * point.x + 0.00583715 * point.y));
}

fn shadowZ(world: vec2<f32>) -> f32 {
    return sceneZ(world) * shadowLift();
}

fn shadowFactor(origin: vec3<f32>, lightDir: vec3<f32>, reach: f32, jitter: f32) -> f32 {
    let stride = reach / f32(SHADOW_STEPS);
    let baselineTravel = reach * (SHADOW_BASELINE / SHADOW_SPAN);
    let trailProbe = origin - lightDir * baselineTravel;
    let receiverRise = max(origin.z - shadowZ(trailProbe.xy) - baselineTravel * lightDir.z, 0.0);
    let risePerTravel = receiverRise / baselineTravel;

    var occlusion = 0.0;
    for (var step = 0; step < SHADOW_STEPS; step += 1) {
        let travel = (f32(step) + jitter) * stride;
        let probe = origin + lightDir * travel;
        let sampleZ = shadowZ(probe.xy);
        let difference = sampleZ - probe.z;
        let bias = SHADOW_BIAS + travel * (SHADOW_SLOPE_BIAS + risePerTravel);
        let thickness = SHADOW_THICKNESS * (1.0 + (travel / SHADOW_SPAN) * SHADOW_THICKNESS_GROWTH);
        if (difference > bias && difference < thickness) {
            // An occluder that has risen past the bulb cannot shadow anything.
            let behindLight = 1.0 - clamp((sampleZ - lightZ()) / SHADOW_FRONT_FADE, 0.0, 1.0);
            occlusion += clamp((difference - bias) / SHADOW_SOFTNESS, 0.0, 1.0) * behindLight;
        }
    }
    return 1.0 - clamp((occlusion / f32(SHADOW_STEPS)) * SHADOW_GAIN, 0.0, 1.0);
}

// --- the bulb ---------------------------------------------------------------

fn bulbPower() -> f32 {
    return intensity() / BULB_REFERENCE_POWER;
}

fn bulbRadius() -> f32 {
    return BULB_WORLD_RADIUS * ((BULB_CAMERA_Z - BULB_REFERENCE_Z) / (BULB_CAMERA_Z - lightZ()));
}

// fwidth only in uniform control flow: taken once at the top of the fragment.
fn bulbEdgeWidth(world: vec2<f32>) -> f32 {
    let spread = length(world - lightPos()) / bulbRadius();
    return clamp(fwidth(spread) * BULB_EDGE, BULB_EDGE_FLOOR, BULB_EDGE_LIMIT);
}

fn bulbSurface(world: vec2<f32>, tint: vec3<f32>, surfaceHeight: f32, edge: f32) -> vec4<f32> {
    let radius = bulbRadius();
    let spread = length(world - lightPos()) / radius;
    let limb = clamp(spread, 0.0, 1.0);
    let dome = sqrt(max(1.0 - limb * limb, 0.0));
    let facing = dome * dome;
    let front = lightZ() + BULB_WORLD_RADIUS * dome;
    let solid = smoothstep(0.0, BULB_OCCLUSION_SOFT, front - surfaceHeight);
    let coverage = (1.0 - smoothstep(1.0 - edge, 1.0 + edge, spread)) * solid;
    let hue = mix(tint, vec3<f32>(1.0), facing * facing);
    return vec4<f32>(hue * (BULB_CORE * bulbPower() * mix(BULB_LIMB, 1.0, facing)), coverage);
}

fn bulbGlow(world: vec2<f32>, tint: vec3<f32>) -> vec3<f32> {
    let radius = bulbRadius();
    let radii = length(world - lightPos()) / radius;
    let halo = exp(-radii / BULB_HALO_SPAN);
    let veil = exp(-radii / BULB_VEIL_SPAN);
    let weight = halo * BULB_HALO + veil * BULB_VEIL;
    return tint * (weight * bulbPower() * bulbExposure());
}

fn cordPoint(index: u32) -> vec2<f32> {
    let packed = params.cordNodes[index / 2u];
    return select(packed.zw, packed.xy, (index & 1u) == 0u);
}

struct CordHit {
    coverage: f32,
    // Signed offset across the wire: -1 at one silhouette, +1 at the other.
    across: f32,
    // Direction the wire runs in at the nearest point.
    tangent: vec2<f32>,
};

fn cordSample(world: vec2<f32>) -> CordHit {
    var hit: CordHit;
    hit.coverage = 0.0;
    hit.across = 0.0;
    hit.tangent = vec2<f32>(0.0, 1.0);

    if (cordOpacity() <= 0.0) {
        return hit;
    }
    let margin = vec2<f32>(CORD_WIDTH);
    if (any(world < params.cordBounds.xy - margin) || any(world > params.cordBounds.zw + margin)) {
        return hit;
    }

    var nearest = 1e9;
    var closest = vec2<f32>(0.0);
    var tangent = vec2<f32>(0.0, 1.0);
    for (var i = 0u; i < CORD_POINTS - 1u; i += 1u) {
        let head = cordPoint(i);
        let span = cordPoint(i + 1u) - head;
        let t = clamp(dot(world - head, span) / max(dot(span, span), 1e-6), 0.0, 1.0);
        let onLine = head + span * t;
        let distance = length(world - onLine);
        if (distance < nearest) {
            nearest = distance;
            closest = onLine;
            tangent = normalize(span + vec2<f32>(1e-6, 0.0));
        }
    }

    let perpendicular = vec2<f32>(-tangent.y, tangent.x);
    hit.coverage = 1.0 - smoothstep(CORD_WIDTH * 0.6, CORD_WIDTH, nearest);
    hit.across = clamp(dot(world - closest, perpendicular) / CORD_WIDTH, -1.0, 1.0);
    hit.tangent = tangent;
    return hit;
}

// The cord shaded as the cylinder it is.
fn cordColour(world: vec2<f32>, hit: CordHit, tint: vec3<f32>) -> vec3<f32> {
    let perpendicular = vec2<f32>(-hit.tangent.y, hit.tangent.x);
    let dome = sqrt(max(1.0 - hit.across * hit.across, 0.0));
    let normal = normalize(vec3<f32>(perpendicular * hit.across, dome));

    let position = vec3<f32>(world, lightZ());
    let lightPosition = vec3<f32>(lightPos(), lightZ() + LIGHT_LIT_LIFT);
    let toLight = lightPosition - position;
    let distance = max(length(toLight), 0.0001);
    let lightDir = toLight / distance;
    let spread = distance / lightReach();
    let falloff = 1.0 / (1.0 + spread * spread);
    let lambert = clamp(dot(normal, lightDir), 0.0, 1.0);

    let halfDir = normalize(lightDir + vec3<f32>(0.0, 0.0, 1.0));
    let sheen = pow(clamp(dot(normal, halfDir), 0.0, 1.0), CORD_SPECULAR_POWER);

    let lit = CORD_TONE * tint * ((lambert * CORD_GAIN + CORD_AMBIENT) * falloff * intensity());
    return lit + tint * (sheen * CORD_SPECULAR * falloff * intensity());
}

// --- tonemapping ------------------------------------------------------------

fn compress(value: f32) -> f32 {
    return (value * (value / (WHITE_POINT * WHITE_POINT) + 1.0)) / (value + 1.0);
}

fn tonemap(color: vec3<f32>) -> vec3<f32> {
    let luminance = max(dot(color, LUMINANCE_WEIGHTS), 0.0001);
    let mapped = compress(luminance);
    let shoulder = color / vec3<f32>(WHITE_POINT * WHITE_POINT) + vec3<f32>(1.0);
    let perChannel = (color * shoulder) / (color + vec3<f32>(1.0));
    let bleach = pow(clamp(mapped, 0.0, 1.0), HIGHLIGHT_BLEACH);
    return clamp(mix(color * (mapped / luminance), perChannel, bleach), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn depthRamp(value: f32) -> vec3<f32> {
    let cold = vec3<f32>(0.03, 0.02, 0.12);
    let middle = vec3<f32>(0.11, 0.45, 0.94);
    let warm = vec3<f32>(0.85, 0.36, 0.96);
    let hot = vec3<f32>(0.97, 0.97, 0.87);
    if (value < 0.4) {
        return mix(cold, middle, value / 0.4);
    }
    if (value < 0.75) {
        return mix(middle, warm, (value - 0.4) / 0.35);
    }
    return mix(warm, hot, (value - 0.75) / 0.25);
}

// --- the pass ---------------------------------------------------------------

@fragment
fn fs(@location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
    let world = worldOf(uv);
    let slot = slotAt(world);
    let tint = params.lightColor.rgb;
    let noise = dither(uv);
    // Taken here, before any branch, so the derivative stays uniform.
    let bulbEdge = bulbEdgeWidth(world);

    var lit = vec3<f32>(0.0);
    var surfaceHeight = VOID_Z;

    if (slot.covered) {
        let surface = sampleSurface(slot);
        let colour = sampleAlbedo(slot);
        let slope = surface.xy * (relief() * RELIEF_SCALE);
        // Compressing the slope keeps depth cliffs from folding the normal flat.
        let tilt = -slope / (1.0 + length(slope) * SLOPE_COMPRESSION);
        let normal = normalize(vec3<f32>(tilt, 1.0));
        surfaceHeight = canvasZ(surface.w);

        if (mode() == MODE_ALBEDO) {
            return vec4<f32>(colour, 1.0);
        }
        if (mode() == MODE_DEPTH) {
            return vec4<f32>(depthRamp(clamp(surface.w, 0.0, 1.0)), 1.0);
        }
        if (mode() == MODE_NORMALS) {
            return vec4<f32>(normal * 0.5 + 0.5, 1.0);
        }

        let position = vec3<f32>(world, surfaceHeight);
        let lightPosition = vec3<f32>(lightPos(), lightZ() + LIGHT_LIT_LIFT);
        let toLight = lightPosition - position;
        let distance = max(length(toLight), 0.0001);
        let lightDir = toLight / distance;
        let spread = distance / lightReach();
        let falloff = 1.0 / (1.0 + spread * spread);
        // Wrapped lambert keeps the terminator soft; squaring puts the contrast back.
        let wrapped = clamp((dot(normal, lightDir) + LIGHT_WRAP) / (1.0 + LIGHT_WRAP), 0.0, 1.0);
        let lambert = wrapped * wrapped;

        var shadow = 1.0;
        if (shadowStrength() > 0.0 && lambert * falloff * intensity() > SHADOW_SKIP) {
            let shadowOrigin = vec3<f32>(world, surfaceHeight * shadowLift());
            let shadowToLight = lightPosition - shadowOrigin;
            let shadowDistance = max(length(shadowToLight), 0.0001);
            // March a fixed span across the canvas rather than all the way to the bulb.
            let reach = shadowDistance * (SHADOW_SPAN / max(length(shadowToLight.xy), SHADOW_SPAN));
            let traced = shadowFactor(shadowOrigin, shadowToLight / shadowDistance, reach, noise);
            shadow = mix(1.0, traced, shadowStrength());
        }

        let occlusion = mix(1.0, surface.z, occlusionStrength());
        let albedo = pow(colour, vec3<f32>(GAMMA));

        // Blinn-Phong sheen, as if the viewer were straight on: the varnish.
        let halfDir = normalize(lightDir + vec3<f32>(0.0, 0.0, 1.0));
        let lobe = pow(clamp(dot(normal, halfDir), 0.0, 1.0), SPECULAR_POWER);
        let grazing = pow(1.0 - clamp(normal.z, 0.0, 1.0), 5.0);
        let highlight = lobe * (SPECULAR_F0 + (1.0 - SPECULAR_F0) * grazing);

        let ambientSpread = distance / AMBIENT_REACH;
        let ambientFalloff = 1.0 / (1.0 + ambientSpread * ambientSpread);
        lit = albedo * AMBIENT_FILL * (exposure() * occlusion * ambientFalloff);
        lit += albedo * tint * (lambert * falloff * shadow * intensity());
        lit += tint * (highlight * falloff * shadow * occlusion * specular() * intensity());
    } else if (mode() != MODE_RELIT) {
        return vec4<f32>(0.0, 0.0, 0.0, 1.0);
    }

    // The bulb hangs at its own depth, so anything nearer than it in the painted scene stands
    // in front of both the bulb and its cord (unless the painting opts out).
    let occludes = select(bulbOcclusionA(), bulbOcclusionB(), slot.useB);
    let occluderZ = select(VOID_Z, surfaceHeight, occludes > 0.5);
    let inFront = smoothstep(0.0, BULB_OCCLUSION_SOFT, lightZ() - occluderZ);

    // The cord is lit rather than drawn as a darkening.
    let hit = cordSample(world);
    let cord = hit.coverage * inFront * cordOpacity();
    lit = mix(lit, cordColour(world, hit, tint), cord);

    let presence = clamp(intensity() / BULB_ONSET, 0.0, 1.0) * bulbOpacity();
    let bulb = bulbSurface(world, tint, occluderZ, bulbEdge);
    lit = mix(lit, bulb.xyz * presence, bulb.w * presence);
    lit += bulbGlow(world, tint) * presence;

    let display = pow(tonemap(lit), vec3<f32>(1.0 / GAMMA));
    return vec4<f32>(display + (noise - 0.5) * DITHER_STEP, 1.0);
}

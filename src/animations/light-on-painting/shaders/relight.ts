/**
 * Relighting pass for `light-on-painting`.
 *
 * A single fullscreen fragment shader. The paintings float on black and slide
 * past horizontally as you page through them; the bulb stays where it is, so it
 * lights whichever canvas has been carried under it.
 *
 * The lighting model is a port of the relighting pass from TypeGPU's
 * `monocular-light-injection` example by Konrad Reczko (@reczko_konrad) at
 * Software Mansion — the shadow march, the bulb and its halo, the tonemap and
 * the composition are his, constants and all.
 *
 *   https://x.com/reczko_konrad/status/2089670934009413751
 *   https://github.com/software-mansion/TypeGPU/tree/main/apps/typegpu-docs/src/examples/image-processing/monocular-light-injection
 *
 * Copyright (c) 2025 Software Mansion <swmansion.com>. MIT licensed; see
 * https://github.com/software-mansion/TypeGPU/blob/main/LICENSE
 *
 * What his original does and this does not: run the depth network itself, per
 * frame, inside TypeGPU, so the depth buffer never leaves the GPU. That is the
 * hard part of his work. A painting never changes, so here the same field is
 * baked offline instead — a reduction in ambition, not an improvement on it.
 *
 * World units: 1.0 == a painting's width, which is also one page. The canvas
 * surface is the z = 0 plane and the painted scene recedes to surfaceFarZ.
 *
 * Only two paintings can be on screen at once, so only two are bound: slot A is
 * the page at `basePage`, slot B the one after it.
 */

export const relightShader = /* wgsl */ `

struct Params {
  lightColor        : vec4f,
  worldScale        : vec2f,  // (uv - paintingCenter) * worldScale -> world
  paintingCenter    : vec2f,  // page centre, in screen uv
  halfExtentA       : vec2f,  // half-size of the slot A painting, world units
  halfExtentB       : vec2f,
  lightPos          : vec2f,  // world
  cordAnchor        : vec2f,  // world, where the cord is pinned
  lightZ            : f32,
  intensity         : f32,
  exposure          : f32,
  relief            : f32,
  specular          : f32,
  shadowStrength    : f32,
  occlusionStrength : f32,
  surfaceFarZ       : f32,
  mode              : u32,
  cordOpacity       : f32,
  lightReach        : f32,
  shadowLift        : f32,
  /** Scroll position, in pages. */
  pageShift         : f32,
  /** Index of the painting bound to slot A. */
  basePage          : f32,
  pageCount         : f32,
  /** 1 lets the painted scene hide the bulb, 0 keeps it always in front. Per
   *  slot, so pages with different answers do not pop as the swipe crosses. */
  bulbOcclusionA    : f32,
  /** 0 hides the bulb and its glow, leaving only what the light does. */
  bulbOpacity       : f32,
  /**
   * How much of the bulb's disc is clear of the scene, computed once on the CPU.
   * It depends only on where the bulb is, so shading it per pixel meant every
   * pixel paying nine dependent texture reads for the same answer.
   */
  bulbExposure      : f32,
  bulbOcclusionB    : f32,
  pad0              : f32,
  /** The cord's bounding box (min.xy, max.xy), so most pixels can skip it. */
  cordBounds        : vec4f,
  /**
   * The simulated cord, anchor first and bulb last, packed two points per vec4.
   * A uniform array of vec2f would be padded to a 16-byte stride, so pairing
   * them up is what keeps this compact.
   */
  cordNodes         : array<vec4f, 6>,
};

const CORD_POINTS = 12u;

@group(0) @binding(0) var<uniform> params : Params;
@group(0) @binding(1) var albedoA   : texture_2d<f32>;
@group(0) @binding(2) var surfaceA  : texture_2d<f32>;
@group(0) @binding(3) var albedoB   : texture_2d<f32>;
@group(0) @binding(4) var surfaceB  : texture_2d<f32>;
@group(0) @binding(5) var texSampler : sampler;

const MODE_RELIT   : u32 = 0u;
const MODE_ALBEDO  : u32 = 1u;
const MODE_DEPTH   : u32 = 2u;
const MODE_NORMALS : u32 = 3u;

// --- look constants (kept in step with the upstream relight fragment) --------

const LIGHT_WRAP         = 0.25;
/**
 * The bulb's glass hangs at lightZ, inside the painted scene, so the nearer
 * parts of it can stand in front of the bulb. Its *light* is emitted from this
 * much closer to the viewer — otherwise every surface nearer than the bulb is
 * lit from behind and the painting goes dark, which is not what a lamp does.
 */
const LIGHT_LIT_LIFT     = 0.34;
const RELIEF_SCALE       = 200.0;
const SLOPE_COMPRESSION  = 0.55;
const SPECULAR_POWER     = 36.0;
const SPECULAR_F0        = 0.06;
const GAMMA              = 2.2;
const WHITE_POINT        = 2.6;
const HIGHLIGHT_BLEACH   = 2.0;
const LUMINANCE_WEIGHTS  = vec3f(0.2126, 0.7152, 0.0722);
const AMBIENT_FILL       = vec3f(0.62, 0.72, 1.0);
// The fill reads as light bouncing back off the canvas, not as a studio flood,
// so it thins out with distance from the bulb.
const AMBIENT_REACH      = 2.2;
const DITHER_STEP        = 1.0 / 255.0;

/** Nothing outside a canvas can occlude anything: park it far behind. */
const VOID_Z = -32.0;

// Each step is a dependent texture read, and the march runs for every lit
// pixel, so this is the single biggest cost in the pass. The per-pixel dither
// jitter below scatters the sample positions, which buys back most of the
// banding a lower count would otherwise show.
const SHADOW_STEPS            = 16;
const SHADOW_SPAN             = 0.3;
const SHADOW_BASELINE         = 0.005;
const SHADOW_BIAS             = 0.014;
const SHADOW_SLOPE_BIAS       = 0.02;
const SHADOW_THICKNESS        = 0.7;
const SHADOW_THICKNESS_GROWTH = 2.6;
const SHADOW_SOFTNESS         = 0.089;
const SHADOW_GAIN             = 2.5;
const SHADOW_FRONT_FADE       = 0.2;
/** Below this the diffuse term is already invisible, so tracing a shadow to
 *  modulate it is sixteen texture reads spent on nothing. */
const SHADOW_SKIP             = 0.02;

const BULB_WORLD_RADIUS     = 0.045;
const BULB_CAMERA_Z         = 2.0;
const BULB_REFERENCE_Z      = 0.42;
const BULB_CORE             = 8.0;
const BULB_LIMB             = 0.28;
const BULB_EDGE             = 0.75;
const BULB_EDGE_FLOOR       = 0.004;
const BULB_EDGE_LIMIT       = 0.3;
const BULB_HALO             = 1.6;
const BULB_HALO_SPAN        = 1.2;
const BULB_VEIL             = 0.12;
const BULB_VEIL_SPAN        = 4.0;
const BULB_ONSET            = 0.6;
const BULB_OCCLUSION_SOFT   = 0.02;
/** The intensity the bulb's own glass is tuned for; brightness scales off it,
 *  so turning the light down dims the filament and not just the painting. */
const BULB_REFERENCE_POWER  = 3.2;

const CORD_WIDTH = 0.004;
/** The cord is a dull rubber flex: it catches the bulb and nothing else. */
const CORD_TONE  = vec3f(0.20, 0.19, 0.18);
const CORD_GAIN  = 0.55;
/** A rubber flex is dull, but not matte — it keeps a thin sheen along its length. */
const CORD_SPECULAR_POWER = 18.0;
const CORD_SPECULAR       = 0.16;
const CORD_AMBIENT        = 0.12;

// --- plumbing ---------------------------------------------------------------

struct VertexOutput {
  @builtin(position) position : vec4f,
  @location(0)       uv       : vec2f,
};

@vertex
fn vs(@builtin(vertex_index) index : u32) -> VertexOutput {
  var corners = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f( 3.0, -1.0),
    vec2f(-1.0,  3.0),
  );
  let corner = corners[index];
  var out : VertexOutput;
  out.position = vec4f(corner, 0.0, 1.0);
  // Flip y so uv (0,0) is the top-left of the canvas, matching the textures.
  out.uv = vec2f((corner.x + 1.0) * 0.5, 1.0 - (corner.y + 1.0) * 0.5);
  return out;
}

fn worldOf(uv : vec2f) -> vec2f {
  return (uv - params.paintingCenter) * params.worldScale;
}

// --- which painting is under this point -------------------------------------

struct Slot {
  /** Position relative to that painting's own centre. */
  local   : vec2f,
  half    : vec2f,
  useB    : bool,
  /** False where the point falls outside every painting. */
  covered : bool,
};

/**
 * Pages sit one world unit apart and each painting is exactly one unit wide, so
 * the page under a point is simply the nearest whole page to it.
 */
fn slotAt(world : vec2f) -> Slot {
  let page = round(world.x + params.pageShift);
  var slot : Slot;
  slot.local = vec2f(world.x - (page - params.pageShift), world.y);
  slot.useB = page > params.basePage + 0.5;
  slot.half = select(params.halfExtentA, params.halfExtentB, slot.useB);
  let inFrame = all(abs(slot.local) <= slot.half);
  let realPage = page >= -0.5 && page <= params.pageCount - 0.5;
  slot.covered = inFrame && realPage;
  return slot;
}

fn paintingUvOf(slot : Slot) -> vec2f {
  return clamp(
    slot.local / (slot.half * 2.0) + vec2f(0.5),
    vec2f(0.0),
    vec2f(1.0),
  );
}

fn sampleSurface(slot : Slot) -> vec4f {
  let uv = paintingUvOf(slot);
  if (slot.useB) {
    return textureSampleLevel(surfaceB, texSampler, uv, 0.0);
  }
  return textureSampleLevel(surfaceA, texSampler, uv, 0.0);
}

fn sampleAlbedo(slot : Slot) -> vec3f {
  let uv = paintingUvOf(slot);
  if (slot.useB) {
    return textureSampleLevel(albedoB, texSampler, uv, 0.0).rgb;
  }
  return textureSampleLevel(albedoA, texSampler, uv, 0.0).rgb;
}

fn canvasZ(depth : f32) -> f32 {
  return mix(params.surfaceFarZ, 0.0, depth);
}

/** Height of whatever the light would hit here — a painted scene, or nothing. */
fn sceneZ(world : vec2f) -> f32 {
  let slot = slotAt(world);
  if (!slot.covered) {
    return VOID_Z;
  }
  return canvasZ(sampleSurface(slot).w);
}

// --- shadows ----------------------------------------------------------------

fn dither(uv : vec2f) -> f32 {
  let point = uv * 1024.0;
  return fract(52.9829189 * fract(0.06711056 * point.x + 0.00583715 * point.y));
}

fn shadowZ(world : vec2f) -> f32 {
  return sceneZ(world) * params.shadowLift;
}

fn shadowFactor(origin : vec3f, lightDir : vec3f, reach : f32, jitter : f32) -> f32 {
  let stride = reach / f32(SHADOW_STEPS);
  let baselineTravel = reach * (SHADOW_BASELINE / SHADOW_SPAN);
  let trailProbe = origin - lightDir * baselineTravel;
  let receiverRise = max(
    origin.z - shadowZ(trailProbe.xy) - baselineTravel * lightDir.z,
    0.0,
  );
  let risePerTravel = receiverRise / baselineTravel;

  var occlusion = 0.0;
  for (var step = 0; step < SHADOW_STEPS; step += 1) {
    let travel = (f32(step) + jitter) * stride;
    let probe = origin + lightDir * travel;
    let sampleZ = shadowZ(probe.xy);
    let difference = sampleZ - probe.z;
    let bias = SHADOW_BIAS + travel * (SHADOW_SLOPE_BIAS + risePerTravel);
    let thickness = SHADOW_THICKNESS *
      (1.0 + (travel / SHADOW_SPAN) * SHADOW_THICKNESS_GROWTH);
    if (difference > bias && difference < thickness) {
      // An occluder that has risen past the bulb cannot shadow anything.
      let behindLight = 1.0 -
        clamp((sampleZ - params.lightZ) / SHADOW_FRONT_FADE, 0.0, 1.0);
      occlusion += clamp((difference - bias) / SHADOW_SOFTNESS, 0.0, 1.0) * behindLight;
    }
  }
  return 1.0 - clamp((occlusion / f32(SHADOW_STEPS)) * SHADOW_GAIN, 0.0, 1.0);
}

// --- the bulb ---------------------------------------------------------------

fn bulbPower() -> f32 {
  return params.intensity / BULB_REFERENCE_POWER;
}

fn bulbRadius() -> f32 {
  return BULB_WORLD_RADIUS *
    ((BULB_CAMERA_Z - BULB_REFERENCE_Z) / (BULB_CAMERA_Z - params.lightZ));
}

/**
 * The bulb's antialiased rim. fwidth may only be called from uniform control
 * flow, so the derivative is taken once at the top of the fragment and handed
 * down rather than computed where it is used.
 */
fn bulbEdgeWidth(world : vec2f) -> f32 {
  let spread = length(world - params.lightPos) / bulbRadius();
  return clamp(fwidth(spread) * BULB_EDGE, BULB_EDGE_FLOOR, BULB_EDGE_LIMIT);
}

fn bulbSurface(
  world : vec2f, tint : vec3f, surfaceHeight : f32, edge : f32,
) -> vec4f {
  let radius = bulbRadius();
  let spread = length(world - params.lightPos) / radius;
  let limb = clamp(spread, 0.0, 1.0);
  let dome = sqrt(max(1.0 - limb * limb, 0.0));
  let facing = dome * dome;
  let front = params.lightZ + BULB_WORLD_RADIUS * dome;
  let solid = smoothstep(0.0, BULB_OCCLUSION_SOFT, front - surfaceHeight);
  let coverage = (1.0 - smoothstep(1.0 - edge, 1.0 + edge, spread)) * solid;
  let hue = mix(tint, vec3f(1.0), facing * facing);
  return vec4f(
    hue * (BULB_CORE * bulbPower() * mix(BULB_LIMB, 1.0, facing)),
    coverage,
  );
}

fn bulbGlow(world : vec2f, tint : vec3f) -> vec3f {
  let radius = bulbRadius();
  let radii = length(world - params.lightPos) / radius;
  let halo = exp(-radii / BULB_HALO_SPAN);
  let veil = exp(-radii / BULB_VEIL_SPAN);
  // No early-out on the weight: the glow is added in linear light, so even a
  // 0.002 step becomes ~0.07 after the gamma curve and rings the background.
  let weight = halo * BULB_HALO + veil * BULB_VEIL;
  return tint * (weight * bulbPower() * params.bulbExposure);
}

fn segmentDistance(world : vec2f, head : vec2f, tail : vec2f) -> f32 {
  let span = tail - head;
  let t = clamp(dot(world - head, span) / max(dot(span, span), 1e-6), 0.0, 1.0);
  return length(world - (head + span * t));
}

fn cordPoint(index : u32) -> vec2f {
  let packed = params.cordNodes[index / 2u];
  return select(packed.zw, packed.xy, (index & 1u) == 0u);
}

/**
 * How strongly the cord covers this pixel.
 *
 * Walking eleven links is not worth doing for the whole screen when the cord
 * occupies a sliver of it, so anything outside the rope's bounding box — which
 * is nearly every pixel — leaves immediately.
 */
struct CordHit {
  coverage : f32,
  /** Signed offset across the wire: -1 at one silhouette, +1 at the other. */
  across   : f32,
  /** Direction the wire runs in at the nearest point. */
  tangent  : vec2f,
};

/**
 * Where this pixel falls on the cord.
 *
 * Walking eleven links is not worth doing for the whole screen when the cord
 * occupies a sliver of it, so anything outside the rope's bounding box — which
 * is nearly every pixel — leaves immediately.
 */
fn cordSample(world : vec2f) -> CordHit {
  var hit : CordHit;
  hit.coverage = 0.0;
  hit.across = 0.0;
  hit.tangent = vec2f(0.0, 1.0);

  if (params.cordOpacity <= 0.0) {
    return hit;
  }
  let margin = vec2f(CORD_WIDTH);
  if (any(world < params.cordBounds.xy - margin) ||
      any(world > params.cordBounds.zw + margin)) {
    return hit;
  }

  var nearest = 1e9;
  var closest = vec2f(0.0);
  var tangent = vec2f(0.0, 1.0);
  for (var i = 0u; i < CORD_POINTS - 1u; i += 1u) {
    let head = cordPoint(i);
    let span = cordPoint(i + 1u) - head;
    let t = clamp(dot(world - head, span) / max(dot(span, span), 1e-6), 0.0, 1.0);
    let onLine = head + span * t;
    let distance = length(world - onLine);
    if (distance < nearest) {
      nearest = distance;
      closest = onLine;
      tangent = normalize(span + vec2f(1e-6, 0.0));
    }
  }

  let perpendicular = vec2f(-tangent.y, tangent.x);
  hit.coverage = 1.0 - smoothstep(CORD_WIDTH * 0.6, CORD_WIDTH, nearest);
  hit.across = clamp(dot(world - closest, perpendicular) / CORD_WIDTH, -1.0, 1.0);
  hit.tangent = tangent;
  return hit;
}

/**
 * Shade the cord as the cylinder it is.
 *
 * Drawn as a flat tinted line it reads as a stroke over the painting rather
 * than an object in it: a real flex has a lit side, a shadowed side and a sheen
 * running along its length. Rolling a normal across its width is what sells it.
 */
fn cordColour(world : vec2f, hit : CordHit, tint : vec3f) -> vec3f {
  let perpendicular = vec2f(-hit.tangent.y, hit.tangent.x);
  let dome = sqrt(max(1.0 - hit.across * hit.across, 0.0));
  let normal = normalize(vec3f(perpendicular * hit.across, dome));

  let position = vec3f(world, params.lightZ);
  let lightPosition = vec3f(params.lightPos, params.lightZ + LIGHT_LIT_LIFT);
  let toLight = lightPosition - position;
  let distance = max(length(toLight), 0.0001);
  let lightDir = toLight / distance;
  let spread = distance / params.lightReach;
  let falloff = 1.0 / (1.0 + spread * spread);
  let lambert = clamp(dot(normal, lightDir), 0.0, 1.0);

  let halfDir = normalize(lightDir + vec3f(0.0, 0.0, 1.0));
  let sheen = pow(clamp(dot(normal, halfDir), 0.0, 1.0), CORD_SPECULAR_POWER);

  let lit = CORD_TONE * tint *
    ((lambert * CORD_GAIN + CORD_AMBIENT) * falloff * params.intensity);
  return lit + tint * (sheen * CORD_SPECULAR * falloff * params.intensity);
}


// --- tonemapping ------------------------------------------------------------

fn compress(value : f32) -> f32 {
  return (value * (value / (WHITE_POINT * WHITE_POINT) + 1.0)) / (value + 1.0);
}

/** Luminance-preserving compression that lets the hottest highlights bleach
 *  out to white, the way film does. */
fn tonemap(color : vec3f) -> vec3f {
  let luminance = max(dot(color, LUMINANCE_WEIGHTS), 0.0001);
  let mapped = compress(luminance);
  let shoulder = color / vec3f(WHITE_POINT * WHITE_POINT) + vec3f(1.0);
  let perChannel = (color * shoulder) / (color + vec3f(1.0));
  let bleach = pow(clamp(mapped, 0.0, 1.0), HIGHLIGHT_BLEACH);
  return clamp(
    mix(color * (mapped / luminance), perChannel, bleach),
    vec3f(0.0),
    vec3f(1.0),
  );
}

fn depthRamp(value : f32) -> vec3f {
  let cold = vec3f(0.03, 0.02, 0.12);
  let middle = vec3f(0.11, 0.45, 0.94);
  let warm = vec3f(0.85, 0.36, 0.96);
  let hot = vec3f(0.97, 0.97, 0.87);
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
fn fs(@location(0) uv : vec2f) -> @location(0) vec4f {
  let world = worldOf(uv);
  let slot = slotAt(world);
  let tint = params.lightColor.rgb;
  let noise = dither(uv);
  // Taken here, before any branch, so the derivative stays uniform.
  let bulbEdge = bulbEdgeWidth(world);

  var lit = vec3f(0.0);
  var surfaceHeight = VOID_Z;

  if (slot.covered) {
    let surface = sampleSurface(slot);
    let colour = sampleAlbedo(slot);
    let slope = surface.xy * (params.relief * RELIEF_SCALE);
    // Compressing the slope keeps depth cliffs from folding the normal flat.
    let tilt = -slope / (1.0 + length(slope) * SLOPE_COMPRESSION);
    let normal = normalize(vec3f(tilt, 1.0));
    surfaceHeight = canvasZ(surface.w);

    if (params.mode == MODE_ALBEDO) {
      return vec4f(colour, 1.0);
    }
    if (params.mode == MODE_DEPTH) {
      return vec4f(depthRamp(clamp(surface.w, 0.0, 1.0)), 1.0);
    }
    if (params.mode == MODE_NORMALS) {
      return vec4f(normal * 0.5 + 0.5, 1.0);
    }

    let position = vec3f(world, surfaceHeight);
    let lightPosition = vec3f(params.lightPos, params.lightZ + LIGHT_LIT_LIFT);
    let toLight = lightPosition - position;
    let distance = max(length(toLight), 0.0001);
    let lightDir = toLight / distance;
    let spread = distance / params.lightReach;
    let falloff = 1.0 / (1.0 + spread * spread);
    // Wrapped lambert keeps the terminator soft; squaring puts the contrast back.
    let wrapped = clamp(
      (dot(normal, lightDir) + LIGHT_WRAP) / (1.0 + LIGHT_WRAP),
      0.0,
      1.0,
    );
    let lambert = wrapped * wrapped;

    var shadow = 1.0;
    // A surface the light never reaches is already dark; tracing it would cost
    // 24 height-field samples to confirm what lambert has established.
    if (
      params.shadowStrength > 0.0 &&
      lambert * falloff * params.intensity > SHADOW_SKIP
    ) {
      let shadowOrigin = vec3f(world, surfaceHeight * params.shadowLift);
      let shadowToLight = lightPosition - shadowOrigin;
      let shadowDistance = max(length(shadowToLight), 0.0001);
      // March a fixed span across the canvas rather than all the way to the bulb.
      let reach = shadowDistance *
        (SHADOW_SPAN / max(length(shadowToLight.xy), SHADOW_SPAN));
      let traced = shadowFactor(
        shadowOrigin, shadowToLight / shadowDistance, reach, noise,
      );
      shadow = mix(1.0, traced, params.shadowStrength);
    }

    let occlusion = mix(1.0, surface.z, params.occlusionStrength);
    let albedo = pow(colour, vec3f(GAMMA));

    // Blinn-Phong sheen, as if the viewer were straight on — the varnish.
    let halfDir = normalize(lightDir + vec3f(0.0, 0.0, 1.0));
    let lobe = pow(clamp(dot(normal, halfDir), 0.0, 1.0), SPECULAR_POWER);
    let grazing = pow(1.0 - clamp(normal.z, 0.0, 1.0), 5.0);
    let highlight = lobe * (SPECULAR_F0 + (1.0 - SPECULAR_F0) * grazing);

    let ambientSpread = distance / AMBIENT_REACH;
    let ambientFalloff = 1.0 / (1.0 + ambientSpread * ambientSpread);
    lit = albedo * AMBIENT_FILL * (params.exposure * occlusion * ambientFalloff);
    lit += albedo * tint * (lambert * falloff * shadow * params.intensity);
    lit += tint * (highlight * falloff * shadow * occlusion *
      params.specular * params.intensity);
  } else if (params.mode != MODE_RELIT) {
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }

  // The bulb hangs at its own depth, so anything nearer than it in the painted
  // scene stands in front of both the bulb and its cord. Some paintings opt out
  // — a portrait would simply swallow the bulb behind the sitter's head.
  let occludes = select(params.bulbOcclusionA, params.bulbOcclusionB, slot.useB);
  let occluderZ = select(VOID_Z, surfaceHeight, occludes > 0.5);
  let inFront = smoothstep(0.0, BULB_OCCLUSION_SOFT, params.lightZ - occluderZ);

  // The cord has to be lit rather than drawn as a darkening, or it vanishes
  // against the black the paintings float on.
  let hit = cordSample(world);
  let cord = hit.coverage * inFront * params.cordOpacity;
  lit = mix(lit, cordColour(world, hit, tint), cord);

  let presence = clamp(params.intensity / BULB_ONSET, 0.0, 1.0) * params.bulbOpacity;
  let bulb = bulbSurface(world, tint, occluderZ, bulbEdge);
  lit = mix(lit, bulb.xyz * presence, bulb.w * presence);
  lit += bulbGlow(world, tint) * presence;

  let display = pow(tonemap(lit), vec3f(1.0 / GAMMA));
  return vec4f(display + (noise - 0.5) * DITHER_STEP, 1.0);
}
`;

import {
  BLOCK_SIZE,
  FIREBALL_DURATION,
  FIREBALL_RADIUS,
  FLAT_ANGLE_X,
  FLAT_ANGLE_Y,
  ISO_ANGLE_X,
  ISO_ANGLE_Y,
  SMOKE_DURATION,
  SMOKE_RADIUS,
  VIEW_SCALE_2D,
  VIEW_SCALE_3D,
  X_OFFSET_2D,
  Y_OFFSET_2D,
} from '../constants';
import { shaderUtils, uniformsStruct } from './helpers';

// Vanilla's explosion_emitter: a cluster of big soft puffs that swells fast,
// then hangs and fades. Drawn as a fullscreen triangle after the blocks, with
// the blast's projected position and radius handed down from the vertex stage
// so the cluster sits exactly where the charge went off and scales with the
// same view transform as the scene.
//
// Deliberately NOT here, because Minecraft has none of them: a ground
// shockwave ring, a screen flash, or lingering scorch.
export const dustVertexShader = /* wgsl */ `
${uniformsStruct}

struct DustOut {
  @builtin(position) position: vec4f,
  @location(0) clipPos: vec2f,
  @location(1) centre: vec2f,
  @location(2) radius: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const BLOCK = ${BLOCK_SIZE};

// The scene's projection, shared so the puff ball tracks the blocks exactly.
fn project(p: vec3f) -> vec2f {
  let progress = uniforms.progress;
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);
  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);
  let ry_x = p.x * cy - p.z * sy;
  let ry_z = p.x * sy + p.z * cy;
  let rx_y = p.y * cx - ry_z * sx;
  let viewScale = mix(${VIEW_SCALE_3D}, ${VIEW_SCALE_2D}, progress);
  let ar = uniforms.aspectRatio;
  let scaleX = viewScale / max(ar, 1.0);
  let scaleY = viewScale / max(1.0 / ar, 1.0);
  let yOffsetScene = mix(0.0, ${Y_OFFSET_2D}, progress);
  let xOffsetScene = mix(0.0, ${X_OFFSET_2D}, progress);
  return vec2f((ry_x + xOffsetScene) * scaleX, (rx_y + yOffsetScene) * scaleY);
}

@vertex
fn main(@builtin(vertex_index) vi: u32) -> DustOut {
  var tri = array<vec2f, 3>(
    vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
  );
  let p = tri[vi];
  var o: DustOut;
  o.position = vec4f(p, 0.0, 1.0);
  o.clipPos = p;

  let blast = vec3f(uniforms.blastX, 6.0 * BLOCK, uniforms.blastZ);
  o.centre = project(blast);
  // Project a point one smoke-radius away to get the radius. Measured in the
  // SAME aspect-corrected space the fragment compares against, or the ball
  // comes out scaled by the aspect ratio and reads as a faint haze.
  let edge = project(blast + vec3f(${SMOKE_RADIUS} * BLOCK, 0.0, 0.0));
  let d = edge - o.centre;
  o.radius = length(vec2f(d.x * uniforms.aspectRatio, d.y));
  return o;
}
`;

export const dustFragmentShader = /* wgsl */ `
${uniformsStruct}
${shaderUtils}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// Nine, not twenty. Vanilla's poof is a handful of discrete puffs, not a
// dense volume - the previous cloud read as fog rather than as an explosion.
const PUFFS = 9;

@fragment
fn main(
  @location(0) clipPos: vec2f,
  @location(1) centre: vec2f,
  @location(2) radius: f32
) -> @location(0) vec4f {
  let t = uniforms.blastT;
  if (t < 0.0 || t > ${SMOKE_DURATION}) {
    return vec4f(0.0);
  }
  // Ratio computed in JS: both constants interpolate as bare integers, and
  // 11 / 21 would be integer division in WGSL.
  let fireRatio = ${(FIREBALL_RADIUS / SMOKE_RADIUS).toFixed(6)};

  // Clip space is not square on a portrait canvas, so correct x by the aspect
  // ratio or every puff comes out as an ellipse.
  let ar = uniforms.aspectRatio;
  var q = vec2f((clipPos.x - centre.x) * ar, clipPos.y - centre.y);

  // Swell fast, then ease out - vanilla's ball is near full size almost
  // immediately and then just hangs.
  let expand = 1.0 - exp(-t * 7.0);
  let r = radius * expand;
  if (length(q) > r * 1.5) {
    return vec4f(0.0);
  }

  let life = clamp(t / ${SMOKE_DURATION}, 0.0, 1.0);
  let fade = (1.0 - life) * (1.0 - life);

  var cover = 0.0;
  var shade = 0.0;
  for (var i = 0; i < PUFFS; i = i + 1) {
    let h = hash31(f32(i) * 7.13 + 1.7);
    let dir = normalize(vec2f(h.x, h.y) * 2.0 - 1.0 + vec2f(0.0001, 0.0));
    // Puffs sit at varied distances and drift upward as they age, the way
    // the emitter's particles do.
    let off = dir * r * (0.15 + 0.85 * h.z) + vec2f(0.0, t * 0.035 * ar);
    let pr = r * (0.26 + 0.26 * fract(h.x * 7.7));
    let d = length(q - off);
    let c = smoothstep(pr, pr * 0.25, d);
    if (c > cover) { cover = c; shade = fract(h.y * 13.1); }
  }

  // Vanilla's puffs are near-white, which works because they hang against a
  // blue sky. This scene's background is #f7f7f7, so a white ball is simply
  // invisible - the value has to come down for the smoke to read at all,
  // with per-puff variation so it billows instead of reading as flat fog.
  let grey = mix(0.58, 0.80, shade);
  var col = vec3f(grey, grey * 0.99, grey * 0.97);
  var a = clamp(cover * fade * 0.52, 0.0, 1.0);

  // Fireball: hot, local and brief. This is what gives the frame its punch,
  // and it has to be a warm colour rather than a white flash, because a white
  // flash on a near-white background does nothing at all.
  let fireT = clamp(t / ${FIREBALL_DURATION.toFixed(4)}, 0.0, 1.0);
  if (fireT < 1.0) {
    let fr = radius * fireRatio * (0.35 + 0.85 * fireT);
    let core = smoothstep(fr, fr * 0.15, length(q));
    let heat = core * (1.0 - fireT) * (1.0 - fireT);
    let fireCol = mix(vec3f(1.0, 0.42, 0.06), vec3f(1.0, 0.93, 0.62), 1.0 - fireT);
    col = mix(col, fireCol, clamp(heat * 1.5, 0.0, 1.0));
    a = clamp(a + heat * 0.8, 0.0, 1.0);
  }

  return vec4f(col * a, a);
}
`;

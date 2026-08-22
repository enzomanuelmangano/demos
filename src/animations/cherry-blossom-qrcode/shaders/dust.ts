import {
  BLOCK_SIZE,
  FLASH_DURATION,
  FLAT_ANGLE_X,
  FLAT_ANGLE_Y,
  ISO_ANGLE_X,
  ISO_ANGLE_Y,
  VIEW_SCALE_2D,
  VIEW_SCALE_3D,
  X_OFFSET_2D,
  Y_OFFSET_2D,
} from '../constants';
import { uniformsStruct } from './helpers';

// Overlay pass drawn AFTER the blocks: the ground shockwave + dust sheet, and
// the muzzle flash. It has to come last because both live in front of the
// debris — the existing shadow quad is under the terrain and would be hidden.
//
// One draw, nine vertices: 0-5 are the ground quad, 6-8 a fullscreen triangle
// for the flash. Colours are premultiplied so a single alpha blend covers
// both a smoke sheet and a blown-out white frame.
export const dustVertexShader = /* wgsl */ `
${uniformsStruct}

struct DustOut {
  @builtin(position) position: vec4f,
  @location(0) plane: vec2f,
  @location(1) kind: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const BLOCK = ${BLOCK_SIZE};
// The sheet reaches well past the grid so the ring can roll off the lawn.
const EXTENT = 1.65;

@vertex
fn main(@builtin(vertex_index) vi: u32) -> DustOut {
  var o: DustOut;

  if (vi >= 6u) {
    // Fullscreen triangle for the flash.
    var tri = array<vec2f, 3>(
      vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0)
    );
    let p = tri[vi - 6u];
    o.position = vec4f(p, 0.0, 1.0);
    o.plane = vec2f(0.0);
    o.kind = 1.0;
    return o;
  }

  var quadVerts = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[vi];

  let gridSize = uniforms.gridSize;
  let halfGrid = gridSize * BLOCK * 0.5;
  let reach = halfGrid * EXTENT;

  // Scene position on the ground plane, a hair above the terrain so the
  // sheet reads as smoke lying on the grass rather than z-fighting with it.
  let localX = qv.x * reach;
  let localY = BLOCK * 0.6;
  let localZ = qv.y * reach;
  o.plane = vec2f(localX, localZ);

  let progress = uniforms.progress;
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  let ry_x = localX * cy - localZ * sy;
  let ry_z = localX * sy + localZ * cy;
  let rx_y = localY * cx - ry_z * sx;

  let viewScale = mix(${VIEW_SCALE_3D}, ${VIEW_SCALE_2D}, progress);
  let ar = uniforms.aspectRatio;
  let scaleX = viewScale / max(ar, 1.0);
  let scaleY = viewScale / max(1.0 / ar, 1.0);

  let yOffsetScene = mix(0.0, ${Y_OFFSET_2D}, progress);
  let xOffsetScene = mix(0.0, ${X_OFFSET_2D}, progress);

  o.position = vec4f(
    (ry_x + xOffsetScene) * scaleX,
    (rx_y + yOffsetScene) * scaleY,
    0.0,
    1.0
  );
  o.kind = 0.0;
  return o;
}
`;

export const dustFragmentShader = /* wgsl */ `
${uniformsStruct}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const BLOCK = ${BLOCK_SIZE};

fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

// Value noise — enough to break the dust sheet into something cloudy.
fn valueNoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

@fragment
fn main(@location(0) plane: vec2f, @location(1) kind: f32) -> @location(0) vec4f {
  let blastT = uniforms.blastT;
  if (blastT < 0.0) {
    return vec4f(0.0);
  }

  // ---- Flash: two frames of blown-out white, gone almost immediately.
  if (kind > 0.5) {
    let flash = exp(-blastT * 26.0) * step(blastT, ${FLASH_DURATION});
    let a = clamp(flash * 0.92, 0.0, 1.0);
    return vec4f(vec3f(1.0, 0.97, 0.9) * a, a);
  }

  let fade = 1.0 - clamp(uniforms.rebuildT * 1.5, 0.0, 1.0);
  if (fade <= 0.0) {
    return vec4f(0.0);
  }

  let blast = vec2f(uniforms.blastX, uniforms.blastZ);
  let dBlocks = length(plane - blast) / BLOCK;

  // Decelerating shockwave: fast off the mark, dragging as it spreads.
  let radius = 34.0 * (1.0 - exp(-blastT * 3.1));
  let width = 1.6 + blastT * 5.5;
  let band = (dBlocks - radius) / width;
  let ring = exp(-band * band) * exp(-blastT * 1.7);

  // Dust sheet trailing behind the ring, torn up by noise and drifting out.
  let n = valueNoise(plane * 26.0 + vec2f(blastT * 0.9, -blastT * 0.6));
  let n2 = valueNoise(plane * 61.0 - vec2f(blastT * 1.4, blastT * 0.5));
  let cloudMask = (1.0 - smoothstep(radius * 0.35, radius * 1.02, dBlocks))
    * smoothstep(0.0, 0.5, blastT)
    * exp(-blastT * 1.15);
  let cloud = cloudMask * (0.35 + 0.65 * n) * (0.45 + 0.55 * n2);

  let dustColor = vec3f(0.29, 0.25, 0.22);
  let ringColor = vec3f(0.8, 0.75, 0.68);

  var a = clamp(cloud * 0.24 + ring * 0.55, 0.0, 1.0) * fade;
  let col = mix(dustColor, ringColor, clamp(ring * 1.4, 0.0, 1.0));

  return vec4f(col * a, a);
}
`;

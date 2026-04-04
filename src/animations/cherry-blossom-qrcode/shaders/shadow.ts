import {
  BLOCK_SIZE,
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

export const shadowVertexShader = /* wgsl */ `
${uniformsStruct}

struct ShadowOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(@builtin(vertex_index) vi: u32) -> ShadowOut {
  var quadVerts = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[vi];
  var o: ShadowOut;
  o.uv = qv * 0.5 + 0.5;

  let gridSize = uniforms.gridSize;
  let blockSize = ${BLOCK_SIZE};
  let halfGrid = gridSize * blockSize * 0.5;
  let shadowScale = 0.85;

  let progress = uniforms.progress;
  let shadowHeight = 0.48;
  let lightDirXZ = vec2f(-0.5, -0.5);
  let shadowOffset = -lightDirXZ * shadowHeight * 0.35 * (1.0 - progress);

  let localX = qv.x * halfGrid * shadowScale + shadowOffset.x;
  let localY = -shadowHeight;
  let localZ = qv.y * halfGrid * shadowScale + shadowOffset.y;

  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  let ry_x = localX * cy - localZ * sy;
  let ry_z = localX * sy + localZ * cy;
  let rx_y = localY * cx - ry_z * sx;
  let rx_z = localY * sx + ry_z * cx;

  let viewScale = mix(${VIEW_SCALE_3D}, ${VIEW_SCALE_2D}, progress);
  let ar = uniforms.aspectRatio;
  let scaleX = viewScale / max(ar, 1.0);
  let scaleY = viewScale / max(1.0 / ar, 1.0);

  let yOffsetScene = mix(0.0, ${Y_OFFSET_2D}, progress);
  let xOffsetScene = mix(0.0, ${X_OFFSET_2D}, progress);

  o.position = vec4f(
    (ry_x + xOffsetScene) * scaleX,
    (rx_y + yOffsetScene) * scaleY,
    0.99,
    1.0
  );

  return o;
}
`;

export const shadowFragmentShader = /* wgsl */ `
${uniformsStruct}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let centered = uv * 2.0 - 1.0;
  let dist = length(centered);

  // Gaussian-like falloff
  let shadowStrength = 0.08;
  let falloff = exp(-dist * dist * 2.5);
  let alpha = shadowStrength * falloff;

  let shadowColor = vec3f(0.1, 0.12, 0.15);
  return vec4f(shadowColor * alpha, alpha);
}
`;

import {
  GRID_COLS,
  GRID_ROWS,
  CELL_FOOTPRINT_ISO,
  CELL_FOOTPRINT_FLAT,
  ISO_ANGLE_Y,
  ISO_ANGLE_X,
  FLAT_ANGLE_Y,
  FLAT_ANGLE_X,
  ISO_VIEWPORT_FILL,
} from '../constants';

export const vertexShader = /* wgsl */ `
struct Uniforms {
  aspectRatio: f32,
  time: f32,
  blockCount: f32,
  progress: f32,
  dataProgress: f32,
  zoomScale: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) color: vec3f,
  @location(1) shade: f32,
  @location(2) isBase: f32,
  @location(3) progress: f32,
  @location(4) isTop: f32,
  @location(5) heightFrac: f32,
  @location(6) edgeDist: f32,
  @location(7) topRim: f32,
  @location(8) shadowCast: f32,
  @location(9) peakLift: f32,
  @location(10) rimLight: f32,
  @location(11) valleyAO: f32,
  @location(12) fresnel: f32,
  @location(13) time: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> blockColors: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockHeights: array<f32>;
@group(0) @binding(4) var<storage, read> heightGrid: array<f32>;
@group(0) @binding(5) var<storage, read> blockColorsB: array<u32>;
@group(0) @binding(6) var<storage, read> blockHeightsB: array<f32>;
@group(0) @binding(7) var<storage, read> heightGridB: array<f32>;

fn heightAtA(c: i32, r: i32) -> f32 {
  if (c < 0 || c >= i32(${GRID_COLS}) || r < 0 || r >= i32(${GRID_ROWS})) {
    return 0.0;
  }
  return heightGrid[u32(c) * ${GRID_ROWS}u + u32(r)];
}

fn heightAtB(c: i32, r: i32) -> f32 {
  if (c < 0 || c >= i32(${GRID_COLS}) || r < 0 || r >= i32(${GRID_ROWS})) {
    return 0.0;
  }
  return heightGridB[u32(c) * ${GRID_ROWS}u + u32(r)];
}

fn heightAt(c: i32, r: i32) -> f32 {
  return mix(heightAtA(c, r), heightAtB(c, r), uniforms.dataProgress);
}

fn valleyOcclusion(myH: f32, col: f32, row: f32) -> f32 {
  let bc = i32(floor(col + 0.5));
  let br = i32(floor(row + 0.5));
  var maxNeighborHeight = 0.0;

  for (var dc: i32 = -1; dc <= 1; dc = dc + 1) {
    for (var dr: i32 = -1; dr <= 1; dr = dr + 1) {
      if (dc == 0 && dr == 0) { continue; }
      let nh = heightAt(bc + dc, br + dr);
      maxNeighborHeight = max(maxNeighborHeight, nh);
    }
  }

  let diff = max(0.0, maxNeighborHeight - myH);
  return smoothstep(0.0, 0.5, diff);
}

fn gridShadow(myH: f32, col: f32, row: f32) -> f32 {
  if (myH < 0.008) {
    return 1.0;
  }
  let lightDir = normalize(vec3f(0.38, 0.84, 0.36));
  var g = vec2f(lightDir.x, lightDir.z);
  let gl = length(g);
  if (gl < 1e-4) {
    return 1.0;
  }
  g = g / gl;
  let bc = i32(floor(col + 0.5));
  let br = i32(floor(row + 0.5));
  var sh = 1.0;
  for (var s: i32 = 1; s < 10; s = s + 1) {
    let nc = bc + i32(round(g.x * f32(s)));
    let nr = br + i32(round(g.y * f32(s)));
    let nh = heightAt(nc, nr);
    if (nh > myH + 0.06) {
      let t = smoothstep(myH + 0.06, myH + 0.36, nh);
      let fall = 1.0 - f32(s) * 0.05;
      sh *= mix(1.0, 0.78, t * 0.55 * max(fall, 0.5));
    }
  }
  return max(sh, 0.58);
}

fn getBlockColor(level: u32) -> vec3f {
  switch(level) {
    case 0u: { return vec3f(0.88, 0.91, 0.89); }
    case 1u: { return vec3f(0.58, 0.85, 0.72); }
    case 2u: { return vec3f(0.32, 0.75, 0.56); }
    case 3u: { return vec3f(0.18, 0.62, 0.45); }
    case 4u: { return vec3f(0.10, 0.50, 0.35); }
    case 6u: { return vec3f(0.978, 0.972, 0.962); }
    default: { return vec3f(0.90, 0.93, 0.90); }
  }
}

fn getFlatColor(level: u32) -> vec3f {
  switch(level) {
    case 0u: { return vec3f(0.93, 0.95, 0.93); }
    case 1u: { return vec3f(0.60, 0.88, 0.74); }
    case 2u: { return vec3f(0.35, 0.78, 0.58); }
    case 3u: { return vec3f(0.20, 0.65, 0.47); }
    case 4u: { return vec3f(0.12, 0.52, 0.37); }
    case 6u: { return vec3f(0.992, 0.988, 0.978); }
    default: { return vec3f(0.93, 0.95, 0.93); }
  }
}

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let progress = uniforms.progress;
  let faceIndex = vertexIndex / 6u;
  let faceVertex = vertexIndex % 6u;

  let blockPos = blockPositions[instanceIndex].xyz;
  let colorA = blockColors[instanceIndex];
  let colorB = blockColorsB[instanceIndex];
  let heightA = blockHeights[instanceIndex];
  let heightB = blockHeightsB[instanceIndex];
  let blockHeight = mix(heightA, heightB, uniforms.dataProgress);
  let blockColor = select(colorA, colorB, uniforms.dataProgress > 0.5);

  let blockSize = 0.009;
  let maxHeight = 8.6;
  let isCard = blockColor == 6u;

  var h3D = max(blockHeight * maxHeight, 0.026);
  var fH = 0.06;
  if (isCard) { h3D = 0.0; fH = 0.0; }
  let height = mix(h3D, fH, progress);

  var localPos: vec3f;
  var faceNormal: vec3f;

  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );

  let qv = quadVerts[faceVertex];

  var csX = mix(${CELL_FOOTPRINT_ISO}, ${CELL_FOOTPRINT_FLAT}, progress);
  var csZ = csX;

  if (isCard) {
    csX = (f32(${GRID_COLS}) + 1.5) * progress;
    csZ = (7.0 + 0.6) * progress;
  }

  let hwX = csX * 0.5;
  let hwZ = csZ * 0.5;
  let hh = height * 0.5;

  switch(faceIndex) {
    case 0u: {
      let ux = qv.x - 0.5;
      let uz = qv.y - 0.5;
      let tr = length(vec2f(ux, uz)) * 2.0;
      let cone = 1.0 - tr * 0.35;
      let yTop = hh * max(cone, 0.0);
      localPos = vec3f(ux * csX, yTop, uz * csZ);
      let bump = 0.8;
      faceNormal = normalize(vec3f(-ux * bump, 1.0, -uz * bump));
    }
    case 1u: {
      localPos = vec3f((qv.x - 0.5) * csX, -hh, (0.5 - qv.y) * csZ);
      faceNormal = vec3f(0.0, -1.0, 0.0);
    }
    case 2u: {
      localPos = vec3f((qv.x - 0.5) * csX, (qv.y - 0.5) * height, hwZ);
      faceNormal = vec3f(0.0, 0.0, 1.0);
    }
    case 3u: {
      localPos = vec3f((0.5 - qv.x) * csX, (qv.y - 0.5) * height, -hwZ);
      faceNormal = vec3f(0.0, 0.0, -1.0);
    }
    case 4u: {
      localPos = vec3f(hwX, (qv.y - 0.5) * height, (qv.x - 0.5) * csZ);
      faceNormal = vec3f(1.0, 0.0, 0.0);
    }
    case 5u: {
      localPos = vec3f(-hwX, (qv.y - 0.5) * height, (0.5 - qv.x) * csZ);
      faceNormal = vec3f(-1.0, 0.0, 0.0);
    }
    default: {
      localPos = vec3f(0.0);
      faceNormal = vec3f(0.0, 1.0, 0.0);
    }
  }

  var worldPos = blockPos * blockSize + localPos * blockSize;
  worldPos.y += hh * blockSize;

  worldPos.x -= (f32(${GRID_COLS}) - 1.0) * blockSize * 0.5;
  worldPos.z -= (f32(${GRID_ROWS}) - 1.0) * blockSize * 0.5;

  let yearIndex = floor(blockPos.z / 7.0);
  let yearGap = 4.0;
  let numGaps = 8.0;
  worldPos.z += (yearIndex * yearGap - numGaps * yearGap * 0.5) * blockSize * progress;

  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY);
  let sy = sin(isoAngleY);
  let cx = cos(isoAngleX);
  let sx = sin(isoAngleX);

  let ry_x = worldPos.x * cy - worldPos.z * sy;
  let ry_z = worldPos.x * sy + worldPos.z * cy;
  let rx_y = worldPos.y * cx - ry_z * sx;
  let rx_z = worldPos.y * sx + ry_z * cx;

  let lightDir = normalize(vec3f(0.38, 0.84, 0.36));
  var rawDiffuse = max(dot(faceNormal, lightDir), 0.0);
  var shade3D = 0.26 + 0.74 * pow(rawDiffuse, 0.62);
  if (faceNormal.y > 0.45) {
    shade3D = min(1.0, shade3D * 1.1 + 0.06);
  }
  if (abs(faceNormal.y) < 0.12) {
    shade3D *= 0.62;
  }
  if (faceNormal.y < -0.45) {
    shade3D *= 0.78;
  }
  let shade = mix(shade3D, 1.0, progress);

  let halfW = (f32(${GRID_COLS}) - 1.0) * blockSize * 0.5;
  let halfZ = (f32(${GRID_ROWS}) - 1.0) * blockSize * 0.5;
  let isoSpanX = abs(cy) * halfW + abs(sy) * halfZ;
  let isoSpanY = abs(sx) * (abs(sy) * halfW + abs(cy) * halfZ) + abs(cx) * 4.2 * blockSize;
  let isoFit = min(${ISO_VIEWPORT_FILL} * uniforms.aspectRatio / max(isoSpanX, 1e-4), ${ISO_VIEWPORT_FILL} / max(isoSpanY, 1e-4));

  let totalZ = f32(${GRID_ROWS}) + numGaps * yearGap;
  let halfH = totalZ * blockSize * 0.5;
  let fitWidth = 0.9 * uniforms.aspectRatio / halfW;
  let fitHeight = 0.9 / halfH;
  let flatScale = min(fitWidth, fitHeight);
  let baseScale = mix(isoFit, flatScale, progress);
  let scale = baseScale * uniforms.zoomScale;

  output.position = vec4f(
    ry_x * scale / uniforms.aspectRatio,
    rx_y * scale,
    rx_z * 0.014 + 0.5,
    1.0
  );

  let color3D_A = getBlockColor(colorA);
  let color3D_B = getBlockColor(colorB);
  let colorFlat_A = getFlatColor(colorA);
  let colorFlat_B = getFlatColor(colorB);
  let color3D = mix(color3D_A, color3D_B, uniforms.dataProgress);
  let colorFlat = mix(colorFlat_A, colorFlat_B, uniforms.dataProgress);
  output.color = mix(color3D, colorFlat, progress);
  output.shade = shade;
  output.progress = progress;

  var isBaseVal = 0.0;
  if (blockColor == 0u) {
    isBaseVal = 1.0;
  }
  output.isBase = isBaseVal;

  var topVal = 0.0;
  if (faceNormal.y > 0.5) {
    topVal = 1.0;
  }
  output.isTop = topVal;

  var hf = clamp((localPos.y + hh) / max(height, 1e-5), 0.0, 1.0);
  if (isCard) {
    hf = 0.5;
  }
  output.heightFrac = hf;
  output.edgeDist = length(vec2f(ry_x, rx_y)) * scale;

  var rim = 0.0;
  if (faceIndex == 0u) {
    let ux = qv.x - 0.5;
    let uz = qv.y - 0.5;
    rim = clamp(length(vec2f(ux, uz)) * 2.0, 0.0, 1.0);
  }
  output.topRim = rim;

  output.shadowCast = gridShadow(blockHeight, blockPos.x, blockPos.z);

  var pl = 0.0;
  if (!isCard && faceIndex == 0u) {
    pl = blockHeight;
  }
  output.peakLift = pl;

  let viewDir = normalize(vec3f(sin(${ISO_ANGLE_Y}), -sin(${ISO_ANGLE_X}), cos(${ISO_ANGLE_Y})));

  let viewDot = abs(dot(faceNormal, viewDir));
  var rimVal = pow(1.0 - viewDot, 4.0);
  rimVal *= smoothstep(0.3, 0.7, abs(faceNormal.x) + abs(faceNormal.z));
  if (isCard) { rimVal = 0.0; }
  output.rimLight = rimVal;

  var aoVal = 0.0;
  if (!isCard && blockHeight > 0.01) {
    aoVal = valleyOcclusion(blockHeight, blockPos.x, blockPos.z);
    aoVal *= (1.0 - hf * 0.5);
  }
  output.valleyAO = aoVal;

  var fresnelVal = pow(1.0 - viewDot, 2.5);
  if (faceNormal.y > 0.5) {
    fresnelVal *= 1.2;
  }
  if (isCard) { fresnelVal = 0.0; }
  output.fresnel = fresnelVal;
  output.time = uniforms.time;

  return output;
}
`;

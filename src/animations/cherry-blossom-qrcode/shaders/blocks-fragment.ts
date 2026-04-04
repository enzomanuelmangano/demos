import { PALETTE } from '../constants';
import { uniformsStruct, wgslVec3 } from './helpers';

export const blocksFragmentShader = /* wgsl */ `
${uniformsStruct}

struct BlockInput {
  @location(0) uv: vec2f,
  @location(1) faceNx: f32,
  @location(2) faceNy: f32,
  @location(3) faceNz: f32,
  @location(4) blockType: f32,
  @location(5) blockH: f32,
  @location(6) col: f32,
  @location(7) row: f32,
  @location(8) layer: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

@fragment
fn main(input: BlockInput) -> @location(0) vec4f {
  let uv = input.uv;
  let N = normalize(vec3f(input.faceNx, input.faceNy, input.faceNz));
  let blockType = i32(input.blockType + 0.5);
  let progress = uniforms.progress;

  // ============================================
  // COLOR PALETTES
  // ============================================

  // Dirt/path (QR light modules) - bright for scannability
  let dirtLight = vec3f(1.0, 0.98, 0.94);
  let dirtMid = vec3f(0.96, 0.94, 0.88);
  let dirtDark = vec3f(0.92, 0.88, 0.82);

  // Cherry blossom (QR dark in canopy)
  let sakuraLight = vec3f(0.70, 0.25, 0.38);
  let sakuraMid = vec3f(0.58, 0.18, 0.30);
  let sakuraDeep = vec3f(0.46, 0.12, 0.24);
  let sakuraRich = vec3f(0.36, 0.07, 0.18);

  // Trunk (QR dark at center)
  let barkLight = vec3f(0.34, 0.18, 0.07);
  let barkMid = vec3f(0.26, 0.13, 0.05);
  let barkDark = vec3f(0.20, 0.09, 0.03);
  let barkDeep = vec3f(0.14, 0.06, 0.02);

  // Grass (QR dark outside tree)
  let grassDark = vec3f(0.05, 0.18, 0.04);
  let grassMid = vec3f(0.07, 0.28, 0.05);
  let grassBright = vec3f(0.12, 0.38, 0.08);

  // ============================================
  // LIGHTING SETUP
  // ============================================

  let sunDir = normalize(vec3f(-0.5, 0.8, -0.5));
  let sunCol = ${wgslVec3(PALETTE.sun)};
  let ambient = vec3f(0.35, 0.38, 0.45);
  let skyFill = ${wgslVec3(PALETTE.skyFill)};
  let bounce = ${wgslVec3(PALETTE.bounce)};

  let NdSun = max(dot(N, sunDir), 0.0);
  let NdUp = max(dot(N, vec3f(0.0, 1.0, 0.0)), 0.0);

  // ============================================
  // PER-BLOCK NOISE
  // ============================================

  let layer = input.layer;
  let seed = vec2f(input.col, input.row);
  let blockSeed = seed.x * 17.3 + seed.y * 31.1 + layer * 73.7;
  let noise1 = fract(sin(blockSeed) * 43758.5);
  let noise2 = fract(sin(blockSeed * 1.7 + 127.1) * 43758.5);
  let noise3 = fract(sin(blockSeed * 2.3 + 311.7) * 43758.5);

  // ============================================
  // TREE SHADOW CALCULATION
  // ============================================

  let gridSize = uniforms.gridSize;
  let cx = gridSize * 0.5;
  let cy = gridSize * 0.5;
  let shadowOffsetX = 1.5;
  let shadowOffsetY = 1.5;
  let dx = input.col - (cx + shadowOffsetX);
  let dy = input.row - (cy + shadowOffsetY);
  let distFromShadowCenter = sqrt(dx * dx + dy * dy);
  let canopyRadius = gridSize * 0.46;
  let trunkRadius = 2.5;
  let shadowT = 1.0 - smoothstep(trunkRadius, canopyRadius, distFromShadowCenter);
  let treeShadow = 1.0 - shadowT * 0.35;

  // Canopy self-shadowing
  let maxCanopyLayer = 15.0;
  let layerRatio = min(layer / maxCanopyLayer, 1.0);
  let canopyAO = 0.65 + layerRatio * 0.35;

  var albedo = vec3f(0.5);

  // ============================================
  // TOP FACE - What QR scanner sees in 2D
  // ============================================

  if (input.faceNy > 0.5) {
    let topWarmTint = vec3f(1.1, 1.08, 1.02);

    if (blockType == 0) {
      // DIRT/PATH
      var dirtColor = dirtMid;
      let t = noise1;
      if (t < 0.5) {
        dirtColor = mix(dirtLight, dirtMid, t / 0.5);
      } else {
        dirtColor = mix(dirtMid, dirtDark, (t - 0.5) / 0.5);
      }
      let shift = (noise2 - 0.5) * 0.1;
      dirtColor = dirtColor * (1.0 + shift) * treeShadow;
      albedo = dirtColor * topWarmTint;

    } else if (blockType == 1) {
      // CHERRY BLOSSOM
      var cherryColor = sakuraMid;
      let t = noise1;
      if (t < 0.33) {
        cherryColor = mix(sakuraLight, sakuraMid, t / 0.33);
      } else if (t < 0.66) {
        cherryColor = mix(sakuraMid, sakuraDeep, (t - 0.33) / 0.33);
      } else {
        cherryColor = mix(sakuraDeep, sakuraRich, (t - 0.66) / 0.34);
      }
      let shift = (noise2 - 0.5) * 0.15;
      cherryColor = cherryColor * (1.0 + shift);

      // Edge rounding effect (fades in 2D)
      let edgeX = min(uv.x, 1.0 - uv.x);
      let edgeY = min(uv.y, 1.0 - uv.y);
      let edgeDist = min(edgeX, edgeY);
      let roundedEdge = smoothstep(0.0, 0.12, edgeDist);
      let edgeDarken = mix(0.88, 1.0, roundedEdge);
      let finalEdge = mix(edgeDarken, 1.0, progress);

      albedo = cherryColor * topWarmTint * canopyAO * finalEdge;

    } else if (blockType == 2) {
      // TRUNK
      var barkColor = barkMid;
      let t = noise1;
      if (t < 0.33) {
        barkColor = mix(barkLight, barkMid, t / 0.33);
      } else if (t < 0.66) {
        barkColor = mix(barkMid, barkDark, (t - 0.33) / 0.33);
      } else {
        barkColor = mix(barkDark, barkDeep, (t - 0.66) / 0.34);
      }
      let shift = (noise2 - 0.5) * 0.2;
      barkColor = barkColor * (1.0 + shift);

      let trunkMaxLayer = 12.0;
      let heightRatio = min(layer / trunkMaxLayer, 1.0);
      let aoShadow = 0.6 + heightRatio * 0.4;

      let edgeX = min(uv.x, 1.0 - uv.x);
      let edgeY = min(uv.y, 1.0 - uv.y);
      let edgeDist = min(edgeX, edgeY);
      let cornerDist = length(vec2f(0.5 - abs(uv.x - 0.5), 0.5 - abs(uv.y - 0.5)));
      let roundedEdge = smoothstep(0.0, 0.18, edgeDist) * smoothstep(0.25, 0.5, cornerDist);
      let edgeAO = mix(0.55, 1.0, roundedEdge);

      albedo = barkColor * aoShadow * edgeAO * topWarmTint;

    } else if (blockType == 3) {
      // GRASS
      let grassBrown = vec3f(0.28, 0.25, 0.12);
      let grassOlive = vec3f(0.32, 0.35, 0.15);

      var grassColor = grassMid;
      let t = noise1;
      if (t < 0.3) {
        grassColor = mix(grassBright, grassMid, t / 0.3);
      } else if (t < 0.6) {
        grassColor = mix(grassMid, grassDark, (t - 0.3) / 0.3);
      } else if (t < 0.8) {
        grassColor = mix(grassDark, grassBrown, (t - 0.6) / 0.2);
      } else {
        grassColor = mix(grassBrown, grassOlive, (t - 0.8) / 0.2);
      }
      let shift = (noise2 - 0.5) * 0.2;
      grassColor = grassColor * (1.0 + shift);
      albedo = grassColor * topWarmTint;

    } else {
      // FALLEN PETALS (type 4)
      let brownLight = vec3f(0.52, 0.42, 0.30);
      let brownDark = vec3f(0.42, 0.32, 0.22);
      let greenLight = vec3f(0.38, 0.48, 0.28);
      let greenDark = vec3f(0.32, 0.42, 0.24);

      var fallenColor = brownLight;
      if (noise1 < 0.5) {
        fallenColor = mix(brownLight, brownDark, noise2);
      } else {
        fallenColor = mix(greenLight, greenDark, noise2);
      }
      let shift = (noise2 - 0.5) * 0.15;
      fallenColor = fallenColor * (1.0 + shift) * treeShadow;
      albedo = fallenColor * topWarmTint;
    }

  // ============================================
  // SIDE FACES
  // ============================================

  } else if (abs(input.faceNz) > 0.5 || abs(input.faceNx) > 0.5) {
    let faceN = normalize(vec3f(input.faceNx, input.faceNy, input.faceNz));
    let sunLight = max(dot(faceN, sunDir), 0.0);
    let shade = 0.3 + sunLight * 0.65;
    let tint = vec3f(0.95, 0.95, 0.98);

    if (blockType == 0) {
      var dirtColor = dirtMid;
      let t = noise1;
      if (t < 0.33) {
        dirtColor = mix(dirtLight, dirtMid, t / 0.33);
      } else if (t < 0.66) {
        dirtColor = mix(dirtMid, dirtDark, (t - 0.33) / 0.33);
      } else {
        dirtColor = dirtDark * (1.0 - (t - 0.66) * 0.3);
      }
      let shift = (noise2 - 0.5) * 0.2;
      dirtColor = dirtColor * (1.0 + shift);
      albedo = dirtColor * shade * tint;

    } else if (blockType == 1) {
      var cherryColor = sakuraMid;
      let t = noise1;
      if (t < 0.33) {
        cherryColor = mix(sakuraLight, sakuraMid, t / 0.33);
      } else if (t < 0.66) {
        cherryColor = mix(sakuraMid, sakuraDeep, (t - 0.33) / 0.33);
      } else {
        cherryColor = mix(sakuraDeep, sakuraRich, (t - 0.66) / 0.34);
      }
      let shift = (noise2 - 0.5) * 0.25;
      cherryColor = cherryColor * (1.0 + shift);

      let edgeX = min(uv.x, 1.0 - uv.x);
      let edgeY = min(uv.y, 1.0 - uv.y);
      let edgeDist = min(edgeX, edgeY);
      let roundedEdge = smoothstep(0.0, 0.12, edgeDist);
      let edgeDarken = mix(0.7, 1.0, roundedEdge);

      albedo = cherryColor * shade * tint * canopyAO * edgeDarken;

    } else if (blockType == 2) {
      var barkColor = barkMid;
      let t = noise1;
      if (t < 0.33) {
        barkColor = mix(barkLight, barkMid, t / 0.33);
      } else if (t < 0.66) {
        barkColor = mix(barkMid, barkDark, (t - 0.33) / 0.33);
      } else {
        barkColor = mix(barkDark, barkDeep, (t - 0.66) / 0.34);
      }
      let shift = (noise2 - 0.5) * 0.2;
      barkColor = barkColor * (1.0 + shift);

      let trunkMaxLayer = 12.0;
      let heightRatio = min(layer / trunkMaxLayer, 1.0);
      let aoShadow = 0.55 + heightRatio * 0.45;

      let edgeX = min(uv.x, 1.0 - uv.x);
      let edgeY = min(uv.y, 1.0 - uv.y);
      let edgeDist = min(edgeX, edgeY);
      let roundedEdge = smoothstep(0.0, 0.15, edgeDist);
      let edgeAO = mix(0.5, 1.0, roundedEdge);
      let verticalAO = 0.8 + uv.y * 0.2;

      albedo = barkColor * aoShadow * verticalAO * edgeAO * shade * tint;

    } else if (blockType == 3) {
      let grassBrown = vec3f(0.28, 0.25, 0.12);
      let grassOlive = vec3f(0.32, 0.35, 0.15);

      var grassColor = grassMid;
      let t = noise1;
      if (t < 0.3) {
        grassColor = mix(grassBright, grassMid, t / 0.3);
      } else if (t < 0.6) {
        grassColor = mix(grassMid, grassDark, (t - 0.6) / 0.3);
      } else if (t < 0.8) {
        grassColor = mix(grassDark, grassBrown, (t - 0.6) / 0.2);
      } else {
        grassColor = mix(grassBrown, grassOlive, (t - 0.8) / 0.2);
      }
      let shift = (noise2 - 0.5) * 0.2;
      grassColor = grassColor * (1.0 + shift);
      albedo = grassColor * shade * tint;

    } else {
      let fallenBrown = vec3f(0.45, 0.35, 0.26);
      let fallenGreen = vec3f(0.35, 0.42, 0.24);
      var fallenColor = mix(fallenBrown, fallenGreen, noise1 * 0.6);
      let shift = (noise2 - 0.5) * 0.15;
      fallenColor = fallenColor * (1.0 + shift);
      albedo = fallenColor * shade * tint;
    }

  // ============================================
  // BOTTOM FACE
  // ============================================

  } else {
    let bottomTint = vec3f(0.6, 0.62, 0.7);
    let fallenBottom = vec3f(0.45, 0.42, 0.32);

    if (blockType == 0) {
      albedo = dirtDark * 0.5 * bottomTint;
    } else if (blockType == 1) {
      albedo = sakuraDeep * 0.5 * bottomTint;
    } else if (blockType == 2) {
      albedo = barkDark * 0.5 * bottomTint;
    } else if (blockType == 3) {
      albedo = grassDark * 0.5 * bottomTint;
    } else {
      albedo = fallenBottom * 0.6 * bottomTint;
    }
  }

  // ============================================
  // FINAL LIGHTING & TONEMAPPING
  // ============================================

  let diffuse = albedo * (ambient + sunCol * NdSun * 0.65 + skyFill * NdUp * 0.25 + bounce * 0.2);
  var hdr = diffuse;
  hdr = acesFilm(hdr * 1.05);
  hdr = pow(hdr, vec3f(1.0 / 2.2));

  return vec4f(hdr, 1.0);
}
`;

import { BLOCK_SIZE, PALETTE } from '../constants';
import { shaderUtils, uniformsStruct, wgslVec3 } from './helpers';

export const blocksFragmentShader = /* wgsl */ `
${uniformsStruct}
${shaderUtils}

struct BlockInput {
  @location(0) uv: vec2f,
  @location(1) faceNx: f32,
  @location(2) faceNy: f32,
  @location(3) faceNz: f32,
  @location(4) blockType: f32,
  @location(5) charge: f32,
  @location(6) col: f32,
  @location(7) row: f32,
  @location(8) layer: f32,
  @location(9) partId: f32,
  @location(10) modelFront: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

const BLOCK = ${BLOCK_SIZE};

fn acesFilm(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

// Axis-aligned rect test in the creeper's 8x8 face grid.
fn faceRect(p: vec2f, x0: f32, y0: f32, x1: f32, y1: f32) -> bool {
  return p.x >= x0 && p.x < x1 && p.y >= y0 && p.y < y1;
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

  // Oak leaves (QR dark in canopy). Kept at roughly the luminance the blossom
  // ramp had, because these blocks ARE the QR's dark modules — a brighter,
  // prettier green would cost scannability.
  // Green carries ~70% of perceived luminance against pink's ~13%, so the
  // same numbers that made a readable sakura canopy make a washed-out green
  // one. These are tuned by luminance, not by eye: leafMid sits near 0.22,
  // matching what the blossom ramp actually measured.
  let leafLight = vec3f(0.18, 0.30, 0.11);
  let leafMid = vec3f(0.15, 0.25, 0.09);
  let leafDeep = vec3f(0.11, 0.19, 0.07);
  let leafRich = vec3f(0.08, 0.13, 0.05);

  // Oak trunk (QR dark at center). Neutral brown rather than the old red-brown
  // — beside green foliage a red bark reads as cherry again.
  let barkLight = vec3f(0.36, 0.26, 0.14);
  let barkMid = vec3f(0.28, 0.20, 0.10);
  let barkDark = vec3f(0.21, 0.15, 0.07);
  let barkDeep = vec3f(0.15, 0.10, 0.05);

  // Grass block tops (QR dark outside tree). Deeper and bluer than the leaf
  // ramp so lawn and canopy stay legible as two different materials now that
  // both are green.
  let grassDark = vec3f(0.03, 0.13, 0.04);
  let grassMid = vec3f(0.05, 0.20, 0.06);
  let grassBright = vec3f(0.07, 0.28, 0.09);

  // Creeper — vanilla's two-tone mottled green.
  let creeperLight = vec3f(0.44, 0.74, 0.32);
  let creeperMid = vec3f(0.31, 0.60, 0.24);
  let creeperDark = vec3f(0.20, 0.42, 0.17);

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
  // CREEPER — shaded apart from the tree: it is a mob, not terrain.
  // ============================================
  if (blockType == 5) {
    // Vanilla's mottle: a coarse per-voxel two-tone, biased darker down the
    // legs so it grounds instead of floating.
    var skin = mix(creeperMid, creeperLight, step(0.55, noise1));
    skin = mix(skin, creeperDark, step(0.78, noise2) * 0.9);
    if (input.partId >= 2.0) {
      skin = mix(skin, creeperDark, 0.35);
    }

    // The face fills the front of the head as one 8x8 texture spread over
    // the 4x4 voxels, exactly like the real skin.
    if (input.partId < 0.5 && input.modelFront > 0.5) {
      let px = ((input.col + 2.0) + uv.x) * 2.0;
      let py = ((3.0 - (layer - 9.0)) + (1.0 - uv.y)) * 2.0;
      let p = vec2f(px, py);
      let isFace =
        faceRect(p, 1.0, 2.0, 3.0, 4.0) ||
        faceRect(p, 5.0, 2.0, 7.0, 4.0) ||
        faceRect(p, 3.0, 4.0, 5.0, 5.0) ||
        faceRect(p, 2.0, 5.0, 6.0, 6.0) ||
        faceRect(p, 2.0, 6.0, 3.0, 7.0) ||
        faceRect(p, 5.0, 6.0, 6.0, 7.0);
      if (isFace) {
        skin = vec3f(0.02, 0.03, 0.02);
      }
    }

    // Cheap directional shading so the cube silhouette still reads.
    let mobShade = 0.42 + max(dot(N, sunDir), 0.0) * 0.58 + NdUp * 0.12;
    albedo = skin * mobShade;

  // ============================================
  // TOP FACE - What QR scanner sees in 2D
  // ============================================

  } else if (input.faceNy > 0.5) {
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
      // OAK LEAVES
      var leafColor = leafMid;
      let t = noise1;
      if (t < 0.33) {
        leafColor = mix(leafLight, leafMid, t / 0.33);
      } else if (t < 0.66) {
        leafColor = mix(leafMid, leafDeep, (t - 0.33) / 0.33);
      } else {
        leafColor = mix(leafDeep, leafRich, (t - 0.66) / 0.34);
      }
      let shift = (noise2 - 0.5) * 0.15;
      leafColor = leafColor * (1.0 + shift);

      // Edge rounding effect (fades in 2D)
      let edgeX = min(uv.x, 1.0 - uv.x);
      let edgeY = min(uv.y, 1.0 - uv.y);
      let edgeDist = min(edgeX, edgeY);
      let roundedEdge = smoothstep(0.0, 0.12, edgeDist);
      let edgeDarken = mix(0.88, 1.0, roundedEdge);
      let finalEdge = mix(edgeDarken, 1.0, progress);

      albedo = leafColor * topWarmTint * canopyAO * finalEdge;

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
      // FOREST FLOOR (type 4) — coarse dirt with moss patches. Darkened from
      // the old fallen-petal colours, which sat too bright for blocks that
      // have to read as QR dark modules.
      let brownLight = vec3f(0.42, 0.33, 0.21);
      let brownDark = vec3f(0.33, 0.25, 0.15);
      let greenLight = vec3f(0.22, 0.30, 0.15);
      let greenDark = vec3f(0.17, 0.24, 0.12);

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
      var leafColor = leafMid;
      let t = noise1;
      if (t < 0.33) {
        leafColor = mix(leafLight, leafMid, t / 0.33);
      } else if (t < 0.66) {
        leafColor = mix(leafMid, leafDeep, (t - 0.33) / 0.33);
      } else {
        leafColor = mix(leafDeep, leafRich, (t - 0.66) / 0.34);
      }
      let shift = (noise2 - 0.5) * 0.25;
      leafColor = leafColor * (1.0 + shift);

      let edgeX = min(uv.x, 1.0 - uv.x);
      let edgeY = min(uv.y, 1.0 - uv.y);
      let edgeDist = min(edgeX, edgeY);
      let roundedEdge = smoothstep(0.0, 0.12, edgeDist);
      let edgeDarken = mix(0.7, 1.0, roundedEdge);

      albedo = leafColor * shade * tint * canopyAO * edgeDarken;

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
        // Was (t - 0.6) / 0.3 — a negative factor that extrapolated the mix
        // and made mid-range grass sides read brighter than the top faces.
        grassColor = mix(grassMid, grassDark, (t - 0.3) / 0.3);
      } else if (t < 0.8) {
        grassColor = mix(grassDark, grassBrown, (t - 0.6) / 0.2);
      } else {
        grassColor = mix(grassBrown, grassOlive, (t - 0.8) / 0.2);
      }
      let shift = (noise2 - 0.5) * 0.2;
      grassColor = grassColor * (1.0 + shift);
      albedo = grassColor * shade * tint;

    } else {
      let fallenBrown = vec3f(0.36, 0.28, 0.18);
      let fallenGreen = vec3f(0.21, 0.28, 0.14);
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
    let fallenBottom = vec3f(0.36, 0.33, 0.24);

    if (blockType == 0) {
      albedo = dirtDark * 0.5 * bottomTint;
    } else if (blockType == 1) {
      albedo = leafDeep * 0.5 * bottomTint;
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

  // ---- Fuse: the creeper flashes white at an accelerating rate ----
  if (blockType == 5) {
    let fuse = clamp(uniforms.fuseT, 0.0, 1.0);
    if (fuse > 0.0) {
      let rate = mix(2.2, 15.0, fuse * fuse);
      let strobe = step(0.5, fract(uniforms.time * rate));
      hdr = mix(hdr, vec3f(1.45), strobe * smoothstep(0.02, 0.85, fuse) * 0.9);
    }
  }

  // ---- Aftermath: soot, crater scorch, embers, fireball -----------
  let blastT = uniforms.blastT;
  if (blastT >= 0.0 && blockType != 5) {
    // Grid-space distance to the detonation, from the block's ORIGINAL cell —
    // debris carries the scorch it picked up where it was standing.
    let bCol = uniforms.blastX / BLOCK + gridSize * 0.5;
    let bRow = uniforms.blastZ / BLOCK + gridSize * 0.5;
    let dGrid = length(vec2f(input.col - bCol, input.row - bRow));

    let fade = 1.0 - clamp(uniforms.rebuildT * 1.35, 0.0, 1.0);
    // Scorch is a property of WHERE a block stood, not of how fast it left —
    // driving it from the impulse painted the whole canopy black as soon as
    // the blast was strong enough to actually throw the tree.
    let heightFalloff = 1.0 - smoothstep(5.0, 20.0, layer);
    let crater = (1.0 - smoothstep(3.0, 13.0, dGrid)) * heightFalloff;
    let soot = clamp(crater * 0.9, 0.0, 1.0) * fade;
    hdr = mix(hdr, hdr * vec3f(0.17, 0.14, 0.13) + vec3f(0.012, 0.009, 0.008), soot);

    // Embers on a SPARSE set of blocks. Glowing every sooted block just added
    // an orange wash that cancelled the char and left the crater looking
    // washed out rather than burnt.
    let isEmber = step(0.84, noise3);
    let emberLife = exp(-blastT * 1.15) * fade;
    let flicker = 0.4 + 0.6 * sin(uniforms.time * 11.0 + noise2 * 42.0);
    hdr += vec3f(1.0, 0.32, 0.06) * soot * isEmber * emberLife * flicker * 0.7;

    // The fireball itself: hot, tight, and gone in a couple of frames.
    let fireball = exp(-blastT * 11.0) * (1.0 - smoothstep(0.0, 9.0, dGrid));
    hdr += vec3f(1.7, 1.2, 0.62) * fireball;
  }

  hdr = acesFilm(hdr * 1.05);
  hdr = pow(hdr, vec3f(1.0 / 2.2));

  return vec4f(hdr, 1.0);
}
`;

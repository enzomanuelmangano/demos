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

// A dark line near a coordinate, for plank seams and window mullions.
fn seam(v: f32, at: f32, w: f32) -> f32 {
  return 1.0 - smoothstep(0.0, w, abs(v - at));
}

@fragment
fn main(input: BlockInput) -> @location(0) vec4f {
  let uv = input.uv;
  let N = normalize(vec3f(input.faceNx, input.faceNy, input.faceNz));
  let blockType = i32(input.blockType + 0.5);
  let layer = input.layer;

  let isTop = input.faceNy > 0.5;
  let isSide = abs(input.faceNz) > 0.5 || abs(input.faceNx) > 0.5;

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
  let blockSeed = input.col * 17.3 + input.row * 31.1 + layer * 73.7;
  let noise1 = fract(sin(blockSeed) * 43758.5);
  let noise2 = fract(sin(blockSeed * 1.7 + 127.1) * 43758.5);
  let noise3 = fract(sin(blockSeed * 2.3 + 311.7) * 43758.5);

  // ============================================
  // HOUSE SHADOW on the lawn. Derived from the real footprint (passed in as
  // uniforms) and pushed away from the sun, rather than the old radial blob.
  // ============================================
  let gridSize = uniforms.gridSize;
  let centre = gridSize * 0.5;
  let shadowPush = 1.7;
  let dxPhone = abs(input.col - centre - shadowPush) - uniforms.phoneHalfW;
  let dzPhone = abs(input.row - centre - shadowPush) - uniforms.phoneHalfD - 1.5;
  let outsidePhone = max(dxPhone, dzPhone);
  let inShadow = 1.0 - smoothstep(0.0, 3.0, outsidePhone);
  // Only the ground takes it; the handset cannot shadow itself this crudely.
  let groundOnly = 1.0 - step(0.5, layer);
  let houseShadow = 1.0 - inShadow * groundOnly * 0.30;

  // ============================================
  // MATERIALS
  // ============================================
  var base = vec3f(0.5);
  // Light the window panes emit on their own, so a lit room survives the
  // face shading that would otherwise dim it to nothing.
  var emissive = vec3f(0.0);
  // Set on the creeper's face pixels so the fuse strobe cannot white them out.
  var creeperFace = 0.0;

  if (blockType == 0) {
    // DIRT PATH - the QR's LIGHT modules. Stays bright: this is half of the
    // contrast the code is read with.
    let dirtLight = vec3f(1.0, 0.98, 0.94);
    let dirtMid = vec3f(0.96, 0.94, 0.88);
    let dirtDark = vec3f(0.92, 0.88, 0.82);
    var c = dirtMid;
    if (noise1 < 0.5) { c = mix(dirtLight, dirtMid, noise1 / 0.5); }
    else { c = mix(dirtMid, dirtDark, (noise1 - 0.5) / 0.5); }
    base = c * (1.0 + (noise2 - 0.5) * 0.1) * houseShadow;

  } else if (blockType == 1) {
    // GRASS - the QR's DARK modules out on the lawn.
    let grassDark = vec3f(0.03, 0.13, 0.04);
    let grassMid = vec3f(0.05, 0.20, 0.06);
    let grassBright = vec3f(0.07, 0.28, 0.09);
    let grassBrown = vec3f(0.18, 0.17, 0.08);
    var c = grassMid;
    if (noise1 < 0.35) { c = mix(grassBright, grassMid, noise1 / 0.35); }
    else if (noise1 < 0.75) { c = mix(grassMid, grassDark, (noise1 - 0.35) / 0.4); }
    else { c = mix(grassDark, grassBrown, (noise1 - 0.75) / 0.25); }
    base = c * (1.0 + (noise2 - 0.5) * 0.2) * houseShadow;

  } else if (blockType == 2) {
    // COBBLESTONE - foundation and chimney. Chunky grey mottle.
    let stoneLight = vec3f(0.56, 0.54, 0.50);
    let stoneMid = vec3f(0.45, 0.43, 0.40);
    let stoneDark = vec3f(0.33, 0.32, 0.30);
    var c = stoneMid;
    if (noise1 < 0.4) { c = mix(stoneLight, stoneMid, noise1 / 0.4); }
    else { c = mix(stoneMid, stoneDark, (noise1 - 0.4) / 0.6); }
    // Coarse pits so cobble does not read as smooth concrete.
    let pit = step(0.72, fract(sin(dot(floor(uv * 3.0), vec2f(41.3, 17.7))) * 4331.7));
    base = c * (1.0 - pit * 0.18) * (1.0 + (noise2 - 0.5) * 0.12);

  } else if (blockType == 3) {
    // PLASTER infill. The half-timbered look lives on this contrast: cream
    // panels held in a dark timber frame. Oak planks against oak posts read
    // as brown-on-brown mush at this size.
    let plasterLight = vec3f(0.95, 0.93, 0.88);
    let plasterMid = vec3f(0.90, 0.87, 0.81);
    let plasterDark = vec3f(0.83, 0.80, 0.73);
    var c = mix(plasterMid, plasterLight, noise1);
    c = mix(c, plasterDark, step(0.82, noise2) * 0.7);
    // Faint trowel mottle so it is not a flat fill.
    let mottle = fract(sin(dot(floor(uv * 4.0), vec2f(23.7, 91.3))) * 2571.3);
    base = c * (0.96 + mottle * 0.06);

  } else if (blockType == 4) {
    // OAK LOG - corner posts and the top plate. Vertical grain, darker.
    let barkLight = vec3f(0.47, 0.35, 0.20);
    let barkMid = vec3f(0.40, 0.29, 0.16);
    let barkDark = vec3f(0.32, 0.23, 0.12);
    var c = mix(barkMid, barkLight, noise1);
    c = mix(c, barkDark, step(0.7, noise2) * 0.8);
    let grain = seam(uv.x, 0.25, 0.05) + seam(uv.x, 0.72, 0.05);
    base = c * (1.0 - grain * 0.22);

  } else if (blockType == 5) {
    // ROOF/DECK board over a DARK module: dark timber. Together with type 6
    // this is what lets a solid roof sit on a QR without erasing it, and in
    // this palette the pair reads as a two-tone wooden roof rather than as a
    // pattern imposed on one.
    let darkLight = vec3f(0.36, 0.24, 0.13);
    let darkMid = vec3f(0.29, 0.19, 0.10);
    let darkDeep = vec3f(0.22, 0.14, 0.07);
    var c = mix(darkMid, darkLight, noise1);
    c = mix(c, darkDeep, step(0.72, noise2) * 0.8);
    // Both roof tiles carry the SAME course shadow, which is what makes a
    // random pattern read as one shingled plane.
    base = c * (1.0 - smoothstep(0.26, 0.0, uv.y) * 0.34);

  } else if (blockType == 6) {
    // ROOF/DECK board over a LIGHT module: pale birch.
    // Warm TAN, not cream. At cream the roof matched the plaster walls and
    // the whole building collapsed into one pale mass; the reference reads
    // as a wooden roof over white walls, so the light tile has to stay wood.
    let paleLight = vec3f(0.88, 0.75, 0.53);
    let paleMid = vec3f(0.81, 0.68, 0.47);
    let paleDark = vec3f(0.72, 0.59, 0.39);
    var c = mix(paleMid, paleLight, noise1);
    c = mix(c, paleDark, step(0.75, noise2) * 0.6);
    base = c * (1.0 - smoothstep(0.26, 0.0, uv.y) * 0.22);

  } else if (blockType == 7) {
    // GLASS - a proper window: four panes in a white frame, cool sky at the
    // top, a warm room behind the bottom, and one specular streak. Opaque,
    // because sorted transparency would cost a second pass, but it reads as
    // glass because of the gradient and the highlight rather than alpha.
    let paneTop = vec3f(0.46, 0.62, 0.74);
    let paneBottom = vec3f(0.72, 0.82, 0.88);
    var c = mix(paneTop, paneBottom, smoothstep(0.15, 0.95, uv.y));

    // Warm interior light, strongest low in the pane where a room would be.
    let roomLight = smoothstep(0.95, 0.0, uv.y);
    let warm = vec3f(1.0, 0.66, 0.30);
    c = mix(c, warm, roomLight * 0.55);
    emissive = warm * roomLight * 0.62;

    // Specular streak across the glass.
    let streak = smoothstep(0.07, 0.0, abs((uv.x * 0.75 + uv.y * 0.65) - 0.78));
    c += vec3f(0.22, 0.24, 0.26) * streak;

    // Mullions: a 2x2 grid plus the outer frame.
    let gx = abs(fract(uv.x * 2.0) - 0.5);
    let gy = abs(fract(uv.y * 2.0) - 0.5);
    let mullion = max(smoothstep(0.40, 0.5, gx), smoothstep(0.40, 0.5, gy));
    let border = 1.0 - smoothstep(0.0, 0.1, min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)));
    let frame = max(mullion, border);
    base = mix(c, vec3f(0.94, 0.93, 0.89), frame * 0.92);
    emissive = emissive * (1.0 - frame);

  } else if (blockType == 8) {
    // DOOR - dark oak with a vertical joint and a handle.
    let doorLight = vec3f(0.40, 0.26, 0.13);
    let doorDark = vec3f(0.29, 0.18, 0.09);
    var c = mix(doorDark, doorLight, noise1 * 0.6 + 0.2);
    let joint = seam(uv.x, 0.5, 0.045);
    let handle = 1.0 - smoothstep(0.0, 0.07, length(uv - vec2f(0.72, 0.5)));
    c = c * (1.0 - joint * 0.35);
    base = mix(c, vec3f(0.62, 0.55, 0.28), handle * 0.8);

  } else if (blockType == 9) {
    // PLANKS - warm decking for the porch, balcony underside and floors.
    let deckLight = vec3f(0.68, 0.50, 0.30);
    let deckMid = vec3f(0.59, 0.43, 0.25);
    let deckDark = vec3f(0.50, 0.36, 0.21);
    var c = mix(deckMid, deckLight, noise1);
    c = mix(c, deckDark, step(0.78, noise2) * 0.7);
    let board = max(seam(uv.y, 0.34, 0.035), seam(uv.y, 0.68, 0.035));
    base = c * (1.0 - board * 0.28);

  } else if (blockType == 10) {
    // LANTERN. Emissive, so it still glows on the shaded side of the house
    // and pools a little warmth on whatever it hangs over.
    let cage = vec3f(0.34, 0.24, 0.13);
    let flame = vec3f(1.0, 0.80, 0.42);
    let inner = 1.0 - smoothstep(0.18, 0.46, length(uv - vec2f(0.5, 0.5)));
    base = mix(cage, flame, inner);
    emissive = flame * (0.35 + inner * 1.15);

  } else if (blockType == 11) {
    // FOLIAGE - planter greenery and lawn bushes. Always sits on a dark
    // module, so it never disturbs the code.
    let leafLight = vec3f(0.26, 0.42, 0.16);
    let leafMid = vec3f(0.19, 0.33, 0.12);
    let leafDark = vec3f(0.13, 0.24, 0.09);
    var c = mix(leafMid, leafLight, noise1);
    c = mix(c, leafDark, step(0.7, noise2) * 0.85);
    // Broken edges so a bush does not read as a solid cube.
    let clump = fract(sin(dot(floor(uv * 4.0), vec2f(51.1, 17.3))) * 8123.7);
    base = c * (0.82 + clump * 0.32);

  } else if (blockType == 12) {
    // PHONE BODY - brushed dark metal frame and bezel.
    let metalLight = vec3f(0.30, 0.31, 0.34);
    let metalMid = vec3f(0.22, 0.23, 0.26);
    let metalDark = vec3f(0.15, 0.16, 0.18);
    var c = mix(metalMid, metalLight, noise1);
    c = mix(c, metalDark, step(0.8, noise2) * 0.7);
    // A bright chamfer along the block edges reads as machined metal.
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let chamfer = 1.0 - smoothstep(0.0, 0.11, edgeDist);
    base = mix(c, vec3f(0.58, 0.60, 0.64), chamfer * 0.55);

  } else if (blockType == 13) {
    // SCREEN. The artwork spans the whole display rather than repeating per
    // block: screen-space coords come from the cell position plus the within
    // block uv, using the real screen bounds passed in as uniforms.
    let screenHalfW = max(uniforms.phoneHalfW - 1.0, 1.0);
    let screenRows = max(uniforms.screenHi - uniforms.screenLo + 1.0, 1.0);
    let fx = ((input.col - (centre - 0.5)) + (uv.x - 0.5)) / screenHalfW;
    let fy = ((layer - uniforms.screenLo) + uv.y) / screenRows;
    let ax = abs(fx);

    let skyTop = vec3f(0.09, 0.34, 0.72);
    let skyBottom = vec3f(0.19, 0.55, 0.90);
    var c = mix(skyBottom, skyTop, clamp(fy, 0.0, 1.0));

    // Install glyph, laid out in CELL units rather than normalised ones. The
    // display is 7 cells wide and 17 tall, so a shape drawn in normalised
    // space comes out stretched to two and a half times its height.
    // The display faces -Z, and that face's uv.x runs MIRRORED against world
    // +x. Using it raw puts a sawtooth in the horizontal coordinate and the
    // artwork comes apart block by block.
    let flipped = input.faceNz < 0.0;
    let sx = select(uv.x, 1.0 - uv.x, flipped);
    let cx = (input.col - (centre - 0.5)) + (sx - 0.5);
    let midRow = (uniforms.screenLo + uniforms.screenHi) * 0.5;
    let cy = (layer - midRow) + (uv.y - 0.5);
    let acx = abs(cx);
    // Only the front pane carries artwork; the edges just take the gradient.
    let onFront = step(0.5, -input.faceNz);

    // Downward arrow into a tray: the most legible "install this" there is.
    let stem = step(acx, 0.7) * step(-0.2, cy) * step(cy, 2.6);
    let headSpan = 1.5;
    let headTop = -0.2;
    let headBottom = headTop - headSpan;
    let head =
      step(headBottom, cy) * step(cy, headTop) *
      step(acx, 2.6 * (cy - headBottom) / headSpan);
    let tray = step(acx, 3.0) * step(-3.1, cy) * step(cy, -2.4);
    let mark = clamp(stem + head + tray, 0.0, 1.0) * onFront;
    c = mix(c, vec3f(0.97, 0.98, 1.0), mark);

    // Slight vignette so the display has depth rather than reading as paint.
    c = c * (1.0 - 0.12 * smoothstep(0.6, 1.15, max(ax, abs(fy * 2.0 - 1.0))));
    base = c;
    emissive = c * 0.85;

  } else {
    // CREEPER (type 14). Shaded apart from the world: it is a mob, not terrain.
    let creeperLight = vec3f(0.44, 0.74, 0.32);
    let creeperMid = vec3f(0.31, 0.60, 0.24);
    let creeperDark = vec3f(0.20, 0.42, 0.17);
    var skin = mix(creeperMid, creeperLight, step(0.55, noise1));
    skin = mix(skin, creeperDark, step(0.78, noise2) * 0.9);
    if (input.partId >= 2.0) { skin = mix(skin, creeperDark, 0.35); }

    // The face fills the front of the head as one 8x8 texture spread over the
    // 4x4 voxels, exactly like the real skin. Tested against the MODEL front,
    // not the world normal, because the mob turns.
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
      if (isFace) { skin = vec3f(0.02, 0.03, 0.02); creeperFace = 1.0; }
    }
    base = skin;
  }

  // ============================================
  // FACE TREATMENT
  // ============================================
  var albedo = base;
  if (blockType == 14) {
    // The mob gets its own cheap directional shading so its silhouette reads.
    albedo = base * (0.42 + max(dot(N, sunDir), 0.0) * 0.58 + NdUp * 0.12);
  } else if (isTop) {
    // Tops are what a scanner sees in the flat view, so they stay clean: a
    // warm tint and a soft edge, nothing that muddies the module value.
    let topWarmTint = vec3f(1.1, 1.08, 1.02);
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let rounded = smoothstep(0.0, 0.1, edgeDist);
    let edgeDarken = mix(0.9, 1.0, rounded);
    // The rounding fades out as the view flattens, so the scan target is flat.
    albedo = base * topWarmTint * mix(edgeDarken, 1.0, uniforms.progress);
  } else if (isSide) {
    let sunLight = max(dot(N, sunDir), 0.0);
    let shade = 0.3 + sunLight * 0.65;
    let verticalAO = 0.82 + uv.y * 0.18;
    let edgeDist = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
    let edgeAO = mix(0.62, 1.0, smoothstep(0.0, 0.13, edgeDist));
    albedo = base * shade * verticalAO * edgeAO * vec3f(0.95, 0.95, 0.98);
  } else {
    albedo = base * 0.5 * vec3f(0.6, 0.62, 0.7);
  }

  // ============================================
  // FINAL LIGHTING & TONEMAPPING
  // ============================================
  let diffuse = albedo * (ambient + sunCol * NdSun * 0.65 + skyFill * NdUp * 0.25 + bounce * 0.2);
  var hdr = diffuse + emissive;

  // ---- Fuse: the creeper flashes white at an accelerating rate ----
  if (blockType == 14) {
    let fuse = clamp(uniforms.fuseT, 0.0, 1.0);
    if (fuse > 0.0) {
      let rate = mix(2.2, 15.0, fuse * fuse);
      let strobe = step(0.5, fract(uniforms.time * rate));
      // Hold back on the face and keep the flash under full white, so the mob
      // still has a silhouette at the moment it matters most. Blowing it out
      // to a featureless slab loses the one frame everybody screenshots.
      let flash = strobe * smoothstep(0.02, 0.85, fuse) * 0.62 * (1.0 - creeperFace * 0.85);
      hdr = mix(hdr, vec3f(1.25, 1.24, 1.18), flash);
    }
  }

  // ---- Aftermath: soot, crater scorch, embers, fireball -----------
  let blastT = uniforms.blastT;
  if (blastT >= 0.0 && blockType != 14) {
    // Grid-space distance to the detonation, from the block's ORIGINAL cell --
    // debris carries the scorch it picked up where it was standing.
    let bCol = uniforms.blastX / BLOCK + centre;
    let bRow = uniforms.blastZ / BLOCK + centre;
    let dGrid = length(vec2f(input.col - bCol, input.row - bRow));

    let fade = 1.0 - clamp(uniforms.rebuildT * 1.35, 0.0, 1.0);
    // Scorch is a property of WHERE a block stood, not of how fast it left.
    let heightFalloff = 1.0 - smoothstep(5.0, 20.0, layer);
    let crater = (1.0 - smoothstep(3.0, 13.0, dGrid)) * heightFalloff;
    let soot = clamp(crater * 0.9, 0.0, 1.0) * fade;
    hdr = mix(hdr, hdr * vec3f(0.17, 0.14, 0.13) + vec3f(0.012, 0.009, 0.008), soot);

    // Embers on a SPARSE set of blocks; glowing every sooted one just washed
    // the char back out again.
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

import {
  BLAST_FRICTION,
  BLAST_GRAVITY,
  BLAST_RADIUS,
  BLAST_REACH_GROUND,
  BLAST_REACH_TREE,
  BLAST_RESTITUTION,
  BLAST_SPEED,
  BLAST_UP_BIAS,
  BLOCK_SIZE,
  CREEPER_CAMERA_YAW,
  CREEPER_LEG_SWING,
  CREEPER_SCALE,
  CREEPER_SPAWN_FRACTION,
  CREEPER_STEP_RATE,
  CREEPER_WALK_BLOCKS,
  DEBRIS_FADE_DURATION,
  DEBRIS_FADE_SPREAD,
  DEBRIS_FADE_START,
  FLAT_ANGLE_X,
  FLAT_ANGLE_Y,
  ISO_ANGLE_X,
  ISO_ANGLE_Y,
  RESISTANCE_DRAG,
  SHAKE_DURATION,
  SHOCK_SPEED,
  VIEW_SCALE_2D,
  VIEW_SCALE_3D,
  X_OFFSET_2D,
  Y_OFFSET_2D,
} from '../constants';
import { shaderUtils, uniformsStruct } from './helpers';
import { CREEPER_HEIGHT, CREEPER_LEG_PIVOT_Y } from '../utils/creeper-model';

// The blast originates at the creeper's chest, not at its feet — debris near
// the trunk base gets thrown outward and up rather than scraped along the
// ground.
const BLAST_CHEST_Y = CREEPER_HEIGHT * 0.45 * CREEPER_SCALE;

export const blocksVertexShader = /* wgsl */ `
${uniformsStruct}
${shaderUtils}

struct BlockOutput {
  @builtin(position) position: vec4f,
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
@group(0) @binding(1) var<storage, read> blockTypes: array<u32>;
@group(0) @binding(2) var<storage, read> blockPositions: array<vec4f>;
@group(0) @binding(3) var<storage, read> blockResistance: array<f32>;
@group(0) @binding(4) var<storage, read> blockBaseY: array<f32>;

const BLOCK = ${BLOCK_SIZE};
const GRAVITY = ${BLAST_GRAVITY} * ${BLOCK_SIZE};
const PI = 3.14159265;

// Closed-form ballistics with bouncing, evaluated fresh every frame from the
// blast clock — no simulation state, so scrubbing the timeline (or a dropped
// frame) can never desync the debris. Returns xyz plus the time the block
// comes to rest, which the tumble uses to stop spinning on the ground.
fn ballistic(p0: vec3f, v0: vec3f, tIn: f32, groundY: f32) -> vec4f {
  var p = p0;
  var v = v0;
  var t = tIn;
  var elapsed = 0.0;
  var restAt = 1e9;

  for (var i = 0; i < 3; i = i + 1) {
    let above = max(p.y - groundY, 0.0);
    let disc = max(v.y * v.y + 2.0 * GRAVITY * above, 0.0);
    let tHit = (v.y + sqrt(disc)) / GRAVITY;
    if (tHit <= 0.0005 || t <= tHit) { break; }

    // Land: carry the horizontal run, lose energy to the impact.
    p = vec3f(p.x + v.x * tHit, groundY, p.z + v.z * tHit);
    let impactVy = v.y - GRAVITY * tHit;
    v = vec3f(
      v.x * ${BLAST_FRICTION},
      -impactVy * ${BLAST_RESTITUTION},
      v.z * ${BLAST_FRICTION}
    );
    t = t - tHit;
    elapsed = elapsed + tHit;

    // Too little energy left to leave the ground again — settle here.
    if (v.y < 0.9 * BLOCK) {
      v = vec3f(v.x * 0.15, 0.0, v.z * 0.15);
      restAt = elapsed;
      break;
    }
  }

  p = vec3f(
    p.x + v.x * t,
    max(p.y + v.y * t - 0.5 * GRAVITY * t * t, groundY),
    p.z + v.z * t
  );
  return vec4f(p, min(restAt, elapsed + 0.35));
}

@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> BlockOutput {
  var output: BlockOutput;
  let blockIdx = vertexIndex / 36u;
  let localVertIdx = vertexIndex % 36u;
  let faceIdx = localVertIdx / 6u;
  let vertIdx = localVertIdx % 6u;

  let blockCount = u32(uniforms.blockCount);
  if (blockIdx >= blockCount) {
    output.position = vec4f(0.0, 0.0, -10.0, 1.0);
    return output;
  }

  let posData = blockPositions[blockIdx];
  let typePacked = blockTypes[blockIdx];
  let isCreeper = typePacked == 5u;

  // The creeper is spawned once and lives in the buffers forever; when no
  // detonation sequence is running it is simply not drawn.
  if (isCreeper && uniforms.creeperAlpha <= 0.001) {
    output.position = vec4f(0.0, 0.0, -10.0, 1.0);
    return output;
  }

  let gridSize = uniforms.gridSize;
  let halfGrid = gridSize * BLOCK * 0.5;
  let cubeSize = BLOCK;
  let h = cubeSize;
  let hw = cubeSize * 0.5;
  let hd = cubeSize * 0.5;

  output.col = posData.x;
  output.row = posData.y;
  output.layer = blockBaseY[blockIdx] / BLOCK;
  output.partId = select(-1.0, posData.z, isCreeper);
  output.blockType = f32(typePacked);

  // Rest position of this block's centre, in scene units.
  var restCentre: vec3f;
  if (isCreeper) {
    // Creeper voxels carry model-local coords; the rig places them below.
    restCentre = vec3f(
      (posData.x + 0.5) * BLOCK,
      blockBaseY[blockIdx] + h * 0.5,
      (posData.y + 0.5) * BLOCK
    );
  } else {
    restCentre = vec3f(
      posData.x * BLOCK - halfGrid,
      blockBaseY[blockIdx] + h * 0.5,
      posData.y * BLOCK - halfGrid
    );
  }

  // ------------------------------------------------------------------
  // Cube face — built from the vertex index, offset around the centre so
  // the debris tumble can rotate the whole cube about itself.
  // ------------------------------------------------------------------
  let quadVerts = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(0.0, 1.0),
    vec2f(0.0, 1.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0)
  );
  let qv = quadVerts[vertIdx];

  var offset = vec3f(0.0);
  var normal = vec3f(0.0);
  if (faceIdx == 0u) {
    offset = vec3f((qv.x - 0.5) * cubeSize, hw, (qv.y - 0.5) * cubeSize);
    normal = vec3f(0.0, 1.0, 0.0);
  } else if (faceIdx == 1u) {
    offset = vec3f((qv.x - 0.5) * cubeSize, -hw, (0.5 - qv.y) * cubeSize);
    normal = vec3f(0.0, -1.0, 0.0);
  } else if (faceIdx == 2u) {
    offset = vec3f((qv.x - 0.5) * cubeSize, (qv.y - 0.5) * h, hd);
    normal = vec3f(0.0, 0.0, 1.0);
  } else if (faceIdx == 3u) {
    offset = vec3f((0.5 - qv.x) * cubeSize, (qv.y - 0.5) * h, -hd);
    normal = vec3f(0.0, 0.0, -1.0);
  } else if (faceIdx == 4u) {
    offset = vec3f(hw, (qv.y - 0.5) * h, (qv.x - 0.5) * cubeSize);
    normal = vec3f(1.0, 0.0, 0.0);
  } else {
    offset = vec3f(-hw, (qv.y - 0.5) * h, (0.5 - qv.x) * cubeSize);
    normal = vec3f(-1.0, 0.0, 0.0);
  }

  output.uv = qv;
  // Face 2 is +Z in MODEL space; the world normal is rotated by the mob's yaw
  // and cannot be used to find its front.
  output.modelFront = select(0.0, 1.0, faceIdx == 2u);

  var centre = restCentre;
  var charge = 0.0;

  if (isCreeper) {
    // ----------------------------------------------------------------
    // Creeper rig: walk in, then plant and swell on the fuse.
    // ----------------------------------------------------------------
    let part = i32(posData.z + 0.5);
    let creeperT = clamp(uniforms.creeperT, 0.0, 1.0);

    // Spawn in first: grow out of the ground at the spawn point, THEN walk.
    // Existing at full size on frame one is what made it read as a prop that
    // had always been there rather than as something arriving.
    let spawnT = clamp(creeperT / ${CREEPER_SPAWN_FRACTION}, 0.0, 1.0);
    let spawnScale = easeOutCubic(spawnT);
    let walkRaw = clamp(
      (creeperT - ${CREEPER_SPAWN_FRACTION}) / (1.0 - ${CREEPER_SPAWN_FRACTION}),
      0.0,
      1.0
    );
    // Constant stride for most of the approach, then a short deceleration
    // into its final spot — a mob that eases the whole way reads like it is
    // sliding on ice.
    var walk = 0.0;
    if (walkRaw <= 0.88) {
      walk = (walkRaw / 0.88) * 0.93;
    } else {
      walk = 0.93 + 0.07 * easeOutCubic((walkRaw - 0.88) / 0.12);
    }
    let walkMoving = (1.0 - smoothstep(0.86, 1.0, walkRaw)) * step(1.0, spawnT);
    // Creepers look at you before they go off. The approach heading is random
    // now, so this rotates to the ONE heading that faces the camera rather
    // than turning by a fixed amount.
    let fuseRaw = clamp(uniforms.fuseT, 0.0, 1.0);
    // The look is its own beat, landing shortly BEFORE the blast rather than
    // the instant the fuse starts: it plants, begins to swell, and only then
    // turns to you - which is the moment worth holding.
    let turn = smoothstep(0.25, 0.8, fuseRaw);
    // Shuffling feet through the turn, then still.
    let moving = max(walkMoving, turn * (1.0 - turn) * 2.4);

    // Legs: diagonal pairs, swinging about the hinge at the top of the leg.
    let phase = uniforms.time * ${CREEPER_STEP_RATE} * 2.0 * PI;
    let diagonal = select(-1.0, 1.0, part == 2 || part == 5);
    let isLeg = part >= 2;
    let swing = sin(phase) * ${CREEPER_LEG_SWING} * moving * select(0.0, 1.0, isLeg) * diagonal;
    let pivot = vec3f(0.0, ${CREEPER_LEG_PIVOT_Y} * BLOCK, 0.0);
    var local = rotX(centre - pivot, swing) + pivot;
    var localNormal = rotX(normal, swing);
    var localOffset = rotX(offset, swing);

    // Body bob on each footfall, and the head lolls slightly out of phase.
    let bob = abs(sin(phase)) * 0.16 * BLOCK * moving;
    local.y += bob;
    if (part == 0) {
      local.y += sin(phase * 0.5) * 0.1 * BLOCK * moving;
    }

    // Fuse: the classic inflate. Scaled about the mob's centre of mass so it
    // puffs up in place instead of growing out of the ground.
    let fuse = fuseRaw;
    let swell = 1.0 + fuse * fuse * 0.3;
    let com = vec3f(0.0, ${CREEPER_HEIGHT} * 0.42 * BLOCK, 0.0);
    local = com + (local - com) * swell;
    localOffset = localOffset * swell;
    // A tightening shudder as it primes.
    local.x += sin(uniforms.time * 42.0) * fuse * fuse * 0.18 * BLOCK;

    // Face the way it walked in, then turn to look straight at the camera.
    // Both headings live inside the same arc, so a plain lerp is safe.
    let yaw = mix(uniforms.spawnAngle, ${CREEPER_CAMERA_YAW}, turn);

    // Shrink the rig to mob scale. Everything above is in model voxels, so a
    // single scale here keeps the pivot, swell and shudder consistent.
    local = local * ${CREEPER_SCALE} * spawnScale;
    localOffset = localOffset * ${CREEPER_SCALE} * spawnScale;
    local = rotY(local, yaw);
    localOffset = rotY(localOffset, yaw);
    localNormal = rotY(localNormal, yaw);

    // rotY(+Z, yaw) — the direction the mob faces, and the direction it
    // walks, so it never moon-walks in from the side.
    let fwd = vec3f(-sin(yaw), 0.0, cos(yaw));
    let standPos = vec3f(uniforms.blastX, 0.0, uniforms.blastZ);
    // Spawn a fixed number of BLOCKS back along the path, not a multiple of
    // the grid: the old 1.35x half-grid start was off the edge of the plate,
    // so the mob walked in over empty space and read as floating.
    let spawn = standPos - fwd * ${CREEPER_WALK_BLOCKS} * BLOCK;
    // Stand ON the lawn. Ground blocks occupy y 0..BLOCK, so feet at y=0 sat
    // a full block below the surface.
    centre = local + mix(spawn, standPos, walk) + vec3f(0.0, BLOCK, 0.0);
    offset = localOffset;
    normal = localNormal;
  } else if (uniforms.blastT >= 0.0) {
    // ----------------------------------------------------------------
    // Detonation. Blocks inside a ragged sphere are thrown, tumble, and
    // then fade out rather than settling: a heap of rubble sitting on the
    // code was covering the one thing the scene exists to show.
    // ----------------------------------------------------------------
    let blast = vec3f(uniforms.blastX, ${BLAST_CHEST_Y} * BLOCK, uniforms.blastZ);
    let toBlock = restCentre - blast;
    let distBlocks = length(toBlock) / BLOCK;
    let rnd = hash31(f32(blockIdx));

    // Everything is thrown, not just what is inside a sphere. Gating on a
    // radius left the outer canopy hovering untouched while the rest faded,
    // which read as a pink island rather than an explosion. The falloff
    // already does the work: distant blocks barely stir before they fade.
    let resistance = blockResistance[blockIdx];

    let rebuild = uniforms.rebuildT;
    if (rebuild <= 0.0) {
      // The shock front takes time to cross the scene. Without it every
      // block departs on the same frame, the canopy translates outward as
      // one piece and keeps its silhouette while "exploding".
      let localT = max(uniforms.blastT - distBlocks / ${SHOCK_SPEED}, 0.0);

      let onGround = output.layer < 0.5;
      let reach = select(${BLAST_REACH_TREE}, ${BLAST_REACH_GROUND}, onGround);
      let falloff = 1.0 / (1.0 + pow(distBlocks / reach, 2.2));
      // Wide, skewed spread. A tight one made every fragment travel the
      // same distance, which is the other half of moving as one piece.
      let spread = 0.35 + 1.75 * rnd.x * rnd.x;
      let speedBlocks =
        ${BLAST_SPEED} * falloff * spread / (1.0 + resistance * ${RESISTANCE_DRAG});
      charge = clamp(speedBlocks / ${BLAST_SPEED}, 0.0, 1.0);

      let radial = normalize(toBlock + vec3f(0.0, 0.0008, 0.0));
      let jitter = (rnd - 0.5) * 0.5;
      let launch = normalize(radial + vec3f(0.0, ${BLAST_UP_BIAS}, 0.0) + jitter);
      let v0 = launch * speedBlocks * BLOCK;

      let groundY = BLOCK * 0.5;
      let flight = ballistic(restCentre, v0, localT, groundY);
      centre = flight.xyz;

      // Fragments are not all one size; uniform cubes read as a grid.
      let sizeVar = 0.58 + 0.80 * rnd.z;
      let sizeMix = clamp(localT / 0.10, 0.0, 1.0);

      // Fade: each block shrinks away on its own staggered clock, so the
      // debris thins out instead of every cube vanishing on one frame.
      let fadeAt = ${DEBRIS_FADE_START} + rnd.y * ${DEBRIS_FADE_SPREAD};
      let fade = clamp((localT - fadeAt) / ${DEBRIS_FADE_DURATION}, 0.0, 1.0);
      let scale = mix(1.0, sizeVar, sizeMix) * (1.0 - fade * fade);
      if (scale < 0.02) {
        output.position = vec4f(0.0, 0.0, -10.0, 1.0);
        return output;
      }

      let axis = normalize(rnd * 2.0 - 1.0 + vec3f(0.0001, 0.0, 0.0));
      let spin = speedBlocks * 0.85 * min(localT, flight.w);
      offset = rotAxis(offset * scale, axis, spin);
      charge = charge * (1.0 - fade);
    } else {
      // Rebuilding: everything thrown has already faded, so blocks simply
      // re-materialise in place, from the centre outward.
      let stagger = clamp(distBlocks / ${BLAST_RADIUS}, 0.0, 1.0);
      let localT = clamp((rebuild - stagger * 0.45) / 0.55, 0.0, 1.0);
      if (localT <= 0.0) {
        output.position = vec4f(0.0, 0.0, -10.0, 1.0);
        return output;
      }
      offset = offset * easeOutCubic(localT);
    }
  }

  output.charge = charge;
  output.faceNx = normal.x;
  output.faceNy = normal.y;
  output.faceNz = normal.z;

  let localPos = centre + offset;

  // Interpolate between 3D isometric and 2D flat view
  let progress = uniforms.progress;
  let isoAngleY = mix(${ISO_ANGLE_Y}, ${FLAT_ANGLE_Y}, progress);
  let isoAngleX = mix(${ISO_ANGLE_X}, ${FLAT_ANGLE_X}, progress);

  let cy = cos(isoAngleY); let sy = sin(isoAngleY);
  let cx = cos(isoAngleX); let sx = sin(isoAngleX);

  // Apply rotation
  let ry_x = localPos.x * cy - localPos.z * sy;
  let ry_z = localPos.x * sy + localPos.z * cy;
  let rx_y = localPos.y * cx - ry_z * sx;
  let rx_z = localPos.y * sx + ry_z * cx;

  // View scaling
  let viewScale = mix(${VIEW_SCALE_3D}, ${VIEW_SCALE_2D}, progress);
  let ar = uniforms.aspectRatio;
  let scaleX = viewScale / max(ar, 1.0);
  let scaleY = viewScale / max(1.0 / ar, 1.0);

  // Centering offsets for 2D view
  let yOffsetScene = mix(0.0, ${Y_OFFSET_2D}, progress);
  let xOffsetScene = mix(0.0, ${X_OFFSET_2D}, progress);

  // Camera shake — a short, fast decay so it punctuates the blast instead of
  // wobbling through the aftermath.
  var shake = vec2f(0.0);
  if (uniforms.blastT >= 0.0 && uniforms.blastT < ${SHAKE_DURATION}) {
    let k = 1.0 - uniforms.blastT / ${SHAKE_DURATION};
    let decay = k * k * k;
    shake = vec2f(
      sin(uniforms.blastT * 71.0) + sin(uniforms.blastT * 113.0) * 0.5,
      cos(uniforms.blastT * 59.0) + cos(uniforms.blastT * 97.0) * 0.5
    ) * decay * 0.024;
  }

  output.position = vec4f(
    (ry_x + xOffsetScene) * scaleX + shake.x,
    (rx_y + yOffsetScene) * scaleY + shake.y,
    // Wider depth spread than the original 0.01 — flying debris needs the
    // extra precision to sort against the blocks still standing.
    rx_z * 0.05 + 0.5,
    1.0
  );
  return output;
}
`;

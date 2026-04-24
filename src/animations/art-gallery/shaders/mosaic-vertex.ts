export const mosaicVertexShader = /* wgsl */ `
struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  focusedX: f32,      // Focused tile center X (-9999 = none)
  focusedY: f32,      // Focused tile center Y (-9999 = none)
  atlasWidth: f32,
  atlasHeight: f32,
  contrast: f32,
  time: f32,
  scale: f32,
  translateX: f32,
  translateY: f32,
  animProgress: f32,  // 1 = old positions, 0 = new positions
  atlasReveal: f32,   // 0-7+: random tile reveal progress
  cellWidth: f32,
  cellHeight: f32,
  focusIntensity: f32,  // 0-1 smooth transition for focus overlay
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) atlasUV: vec2f,
  @location(1) @interpolate(flat) atlasIndex: u32,
  @location(2) @interpolate(flat) focusDim: f32,  // 0 = focused, 1 = fully dimmed
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> tiles: array<f32>;
@group(0) @binding(10) var<storage, read> oldTiles: array<f32>;

// Tile data layout (12 floats per tile, padded for alignment):
// [posX, posY, width, height, uvX, uvY, uvW, uvH, atlasIndex, pad, pad, pad]

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let quadIndex = vertexIndex % 6u;

  var localPos: vec2f;
  var localUV: vec2f;

  switch(quadIndex) {
    case 0u: { localPos = vec2f(0.0, 0.0); localUV = vec2f(0.0, 0.0); }
    case 1u: { localPos = vec2f(1.0, 0.0); localUV = vec2f(1.0, 0.0); }
    case 2u: { localPos = vec2f(0.0, 1.0); localUV = vec2f(0.0, 1.0); }
    case 3u: { localPos = vec2f(0.0, 1.0); localUV = vec2f(0.0, 1.0); }
    case 4u: { localPos = vec2f(1.0, 0.0); localUV = vec2f(1.0, 0.0); }
    case 5u: { localPos = vec2f(1.0, 1.0); localUV = vec2f(1.0, 1.0); }
    default: { localPos = vec2f(0.0, 0.0); localUV = vec2f(0.0, 0.0); }
  }

  let tileOffset = instanceIndex * 12u;

  // New tile data
  let tileX = tiles[tileOffset + 0u];
  let tileY = tiles[tileOffset + 1u];
  let tileW = tiles[tileOffset + 2u];
  let tileH = tiles[tileOffset + 3u];
  let uvX = tiles[tileOffset + 4u];
  let uvY = tiles[tileOffset + 5u];
  let uvW = tiles[tileOffset + 6u];
  let uvH = tiles[tileOffset + 7u];
  let atlasIdx = u32(tiles[tileOffset + 8u]);

  // Old tile data
  let oldX = oldTiles[tileOffset + 0u];
  let oldY = oldTiles[tileOffset + 1u];
  let oldW = oldTiles[tileOffset + 2u];
  let oldH = oldTiles[tileOffset + 3u];

  // Animation progress: t goes from 1 (old) to 0 (new)
  // When t = 0, tiles are at rest with NO 3D effect
  let t = uniforms.animProgress;

  // Interpolate position
  let posX = mix(tileX, oldX, t);
  let posY = mix(tileY, oldY, t);
  var sizeW = mix(tileW, oldW, t);
  var sizeH = mix(tileH, oldH, t);

  // Random tile reveal - each tile has a random threshold within its atlas band
  let seed = f32(instanceIndex);
  let randomDelay = fract(sin(seed * 12.9898 + 78.233) * 43758.5453);
  let revealThreshold = f32(atlasIdx) + randomDelay * 0.95;

  // Smooth pop-in: scale from 0 to 1 with overshoot
  let revealDelta = uniforms.atlasReveal - revealThreshold;
  let revealT = clamp(revealDelta * 8.0, 0.0, 1.0);
  // Elastic ease-out for satisfying pop
  let overshoot = 1.0 + sin(revealT * 3.14159) * 0.15;
  let revealScale = revealT * overshoot;
  sizeW *= revealScale;
  sizeH *= revealScale;


  // Calculate movement for 3D intensity
  let deltaX = tileX - oldX;
  let deltaY = tileY - oldY;
  let moveDistance = sqrt(deltaX * deltaX + deltaY * deltaY);
  let normalizedMove = min(moveDistance / uniforms.screenWidth, 1.0);

  // 3D effect intensity - bell curve that peaks mid-animation, zero at rest
  // sin(t * PI) = 0 when t=0, peaks at t=0.5, back to 0 at t=1
  let effectIntensity = sin(t * 3.14159);

  // Subtle Z depth toward camera (only during animation)
  let zDepth = effectIntensity * (80.0 + normalizedMove * 120.0);

  // Gentle rotation based on movement direction (only during animation)
  let rotationAmount = effectIntensity * 0.15 * normalizedMove;

  // Compute tile corner position relative to tile center
  let cornerX = (localPos.x - 0.5) * sizeW;
  let cornerY = (localPos.y - 0.5) * sizeH;

  // Apply subtle Y-axis rotation (tilt)
  let cosR = cos(rotationAmount);
  let sinR = sin(rotationAmount);
  let rotatedX = cornerX * cosR;
  let rotatedZ = cornerX * sinR;

  // World position (tile center + rotated corner)
  let tileCenterX = posX + sizeW * 0.5;
  let tileCenterY = posY + sizeH * 0.5;
  let worldX = tileCenterX + rotatedX;
  let worldY = tileCenterY + cornerY;
  let worldZ = zDepth + rotatedZ * 20.0;

  // Apply user scale and translation
  let scaledX = worldX * uniforms.scale;
  let scaledY = worldY * uniforms.scale;

  // Convert to screen space (centered)
  var screenX = scaledX + uniforms.translateX + uniforms.screenWidth / 2.0;
  var screenY = scaledY + uniforms.translateY + uniforms.screenHeight / 2.0;

  // Apply perspective projection only during animation
  // When effectIntensity = 0, perspectiveFactor = 1.0 (no distortion)
  let cameraZ = 800.0;
  let perspectiveFactor = cameraZ / (cameraZ - worldZ);

  // Blend between flat (1.0) and perspective based on effect intensity
  let blendedPerspective = mix(1.0, perspectiveFactor, effectIntensity);

  // Project toward screen center
  let screenCenterX = uniforms.screenWidth / 2.0;
  let screenCenterY = uniforms.screenHeight / 2.0;
  screenX = screenCenterX + (screenX - screenCenterX) * blendedPerspective;
  screenY = screenCenterY + (screenY - screenCenterY) * blendedPerspective;

  let ndcX = 2.0 * (screenX / uniforms.screenWidth) - 1.0;
  let ndcY = 1.0 - 2.0 * (screenY / uniforms.screenHeight);

  // Z for depth sorting (only matters during animation)
  let ndcZ = worldZ / 1000.0;

  output.position = vec4f(ndcX, ndcY, clamp(ndcZ, 0.0, 1.0), 1.0);
  output.atlasUV = vec2f(uvX + localUV.x * uvW, uvY + localUV.y * uvH);
  output.atlasIndex = atlasIdx;

  // Compute focus dimming based on distance to focused position
  var focusDim = 0.0;
  if (uniforms.focusedX > -9000.0 && uniforms.focusIntensity > 0.001) {
    // Tile center in screen-relative coords
    let tileCenterX = posX + sizeW * 0.5;
    let tileCenterY = posY + sizeH * 0.5;

    // Distance to focused position (normalized by cell size)
    let dx = (tileCenterX - uniforms.focusedX) / uniforms.cellWidth;
    let dy = (tileCenterY - uniforms.focusedY) / uniforms.cellHeight;
    let dist = sqrt(dx * dx + dy * dy);

    // Smooth falloff: 0 at center, 1 at distance >= 1 cell
    let falloff = clamp(dist, 0.0, 1.0);

    // Apply dimming based on distance, scaled by intensity
    focusDim = 0.8 * falloff * uniforms.focusIntensity;
  }
  output.focusDim = focusDim;

  return output;
}
`;

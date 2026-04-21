export const mosaicVertexShader = /* wgsl */ `
struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  paintingWidth: f32,
  paintingHeight: f32,
  atlasWidth: f32,
  atlasHeight: f32,
  contrast: f32,
  time: f32,
  highResCols: f32,
  highResSize: f32,
  scale: f32,
  translateX: f32,
  translateY: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) atlasUV: vec2f,
  @location(1) highResUV: vec2f,
  @location(2) highResSlot: f32,  // -1 = no high-res, >= 0 = slot index
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> tiles: array<f32>;

// Tile data layout (10 floats per tile):
// [posX, posY, width, height, uvX, uvY, uvW, uvH, highResSlot, padding]

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  // 6 vertices per quad (2 triangles)
  let quadIndex = vertexIndex % 6u;

  // Local quad positions (0-1 range)
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

  // Read tile data from storage buffer (10 floats per tile)
  let tileOffset = instanceIndex * 10u;
  let tileX = tiles[tileOffset + 0u];
  let tileY = tiles[tileOffset + 1u];
  let tileW = tiles[tileOffset + 2u];
  let tileH = tiles[tileOffset + 3u];
  let uvX = tiles[tileOffset + 4u];
  let uvY = tiles[tileOffset + 5u];
  let uvW = tiles[tileOffset + 6u];
  let uvH = tiles[tileOffset + 7u];
  let highResSlot = tiles[tileOffset + 8u];

  // Calculate world position within painting
  let worldX = tileX + localPos.x * tileW;
  let worldY = tileY + localPos.y * tileH;

  // Position relative to painting center (for scaling around center)
  let centeredX = worldX - uniforms.paintingWidth / 2.0;
  let centeredY = worldY - uniforms.paintingHeight / 2.0;

  // Apply scale around painting center
  let scaledX = centeredX * uniforms.scale;
  let scaledY = centeredY * uniforms.scale;

  // Apply translation and move back to screen space
  let screenX = scaledX + uniforms.translateX + uniforms.screenWidth / 2.0;
  let screenY = scaledY + uniforms.translateY + uniforms.screenHeight / 2.0;

  // Convert to NDC
  let ndcX = 2.0 * (screenX / uniforms.screenWidth) - 1.0;
  let ndcY = 1.0 - 2.0 * (screenY / uniforms.screenHeight);

  output.position = vec4f(ndcX, ndcY, 0.0, 1.0);

  // Atlas UV coordinates
  output.atlasUV = vec2f(
    uvX + localUV.x * uvW,
    uvY + localUV.y * uvH
  );

  // High-res UV coordinates (if slot >= 0)
  output.highResSlot = highResSlot;
  if (highResSlot >= 0.0) {
    let slot = u32(highResSlot);
    let cols = u32(uniforms.highResCols);
    let slotCol = slot % cols;
    let slotRow = slot / cols;

    // Calculate UV within the high-res cache texture
    let cacheSize = uniforms.highResCols * uniforms.highResSize;
    let slotX = f32(slotCol) * uniforms.highResSize;
    let slotY = f32(slotRow) * uniforms.highResSize;

    output.highResUV = vec2f(
      (slotX + localUV.x * uniforms.highResSize) / cacheSize,
      (slotY + localUV.y * uniforms.highResSize) / cacheSize
    );
  } else {
    output.highResUV = vec2f(0.0, 0.0);
  }

  return output;
}
`;

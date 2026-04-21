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
  scale: f32,
  translateX: f32,
  translateY: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) atlasUV: vec2f,
  @location(1) @interpolate(flat) atlasIndex: u32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> tiles: array<f32>;

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
  let tileX = tiles[tileOffset + 0u];
  let tileY = tiles[tileOffset + 1u];
  let tileW = tiles[tileOffset + 2u];
  let tileH = tiles[tileOffset + 3u];
  let uvX = tiles[tileOffset + 4u];
  let uvY = tiles[tileOffset + 5u];
  let uvW = tiles[tileOffset + 6u];
  let uvH = tiles[tileOffset + 7u];
  let atlasIdx = u32(tiles[tileOffset + 8u]);

  let worldX = tileX + localPos.x * tileW;
  let worldY = tileY + localPos.y * tileH;

  let centeredX = worldX - uniforms.paintingWidth / 2.0;
  let centeredY = worldY - uniforms.paintingHeight / 2.0;

  let scaledX = centeredX * uniforms.scale;
  let scaledY = centeredY * uniforms.scale;

  let screenX = scaledX + uniforms.translateX + uniforms.screenWidth / 2.0;
  let screenY = scaledY + uniforms.translateY + uniforms.screenHeight / 2.0;

  let ndcX = 2.0 * (screenX / uniforms.screenWidth) - 1.0;
  let ndcY = 1.0 - 2.0 * (screenY / uniforms.screenHeight);

  output.position = vec4f(ndcX, ndcY, 0.0, 1.0);
  output.atlasUV = vec2f(uvX + localUV.x * uvW, uvY + localUV.y * uvH);
  output.atlasIndex = atlasIdx;

  return output;
}
`;

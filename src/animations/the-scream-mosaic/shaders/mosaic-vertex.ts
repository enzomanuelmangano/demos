export const mosaicVertexShader = /* wgsl */ `
struct Uniforms {
  canvasWidth: f32,
  canvasHeight: f32,
  atlasWidth: f32,
  atlasHeight: f32,
  contrast: f32,
  time: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<storage, read> tiles: array<f32>;

// Tile data layout (8 floats per tile):
// [posX, posY, width, height, uvX, uvY, uvW, uvH]

@vertex
fn main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  // 6 vertices per quad (2 triangles)
  // Triangle 1: 0, 1, 2 (bottom-left, bottom-right, top-left)
  // Triangle 2: 2, 1, 3 (top-left, bottom-right, top-right)
  let quadIndex = vertexIndex % 6u;

  // Local quad positions (0-1 range)
  var localPos: vec2f;
  var localUV: vec2f;

  switch(quadIndex) {
    case 0u: { localPos = vec2f(0.0, 0.0); localUV = vec2f(0.0, 0.0); } // bottom-left
    case 1u: { localPos = vec2f(1.0, 0.0); localUV = vec2f(1.0, 0.0); } // bottom-right
    case 2u: { localPos = vec2f(0.0, 1.0); localUV = vec2f(0.0, 1.0); } // top-left
    case 3u: { localPos = vec2f(0.0, 1.0); localUV = vec2f(0.0, 1.0); } // top-left
    case 4u: { localPos = vec2f(1.0, 0.0); localUV = vec2f(1.0, 0.0); } // bottom-right
    case 5u: { localPos = vec2f(1.0, 1.0); localUV = vec2f(1.0, 1.0); } // top-right
    default: { localPos = vec2f(0.0, 0.0); localUV = vec2f(0.0, 0.0); }
  }

  // Read tile data from storage buffer
  let tileOffset = instanceIndex * 8u;
  let tileX = tiles[tileOffset + 0u];
  let tileY = tiles[tileOffset + 1u];
  let tileW = tiles[tileOffset + 2u];
  let tileH = tiles[tileOffset + 3u];
  let uvX = tiles[tileOffset + 4u];
  let uvY = tiles[tileOffset + 5u];
  let uvW = tiles[tileOffset + 6u];
  let uvH = tiles[tileOffset + 7u];

  // Calculate world position
  let worldX = tileX + localPos.x * tileW;
  let worldY = tileY + localPos.y * tileH;

  // Convert to NDC (-1 to 1)
  // Note: WebGPU NDC has Y-up, but our canvas has Y-down
  // So we flip Y: ndcY = 1.0 - 2.0 * (worldY / canvasHeight)
  let ndcX = 2.0 * (worldX / uniforms.canvasWidth) - 1.0;
  let ndcY = 1.0 - 2.0 * (worldY / uniforms.canvasHeight);

  output.position = vec4f(ndcX, ndcY, 0.0, 1.0);

  // Calculate atlas UV coordinates
  output.uv = vec2f(
    uvX + localUV.x * uvW,
    uvY + localUV.y * uvH
  );

  return output;
}
`;

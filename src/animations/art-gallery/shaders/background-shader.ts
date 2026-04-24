export const backgroundVertexShader = /* wgsl */ `
@vertex
fn main(@builtin(vertex_index) vertexIndex: u32) -> @builtin(position) vec4f {
  // Fullscreen triangle (covers entire screen with 3 vertices)
  var pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  return vec4f(pos[vertexIndex], 0.0, 1.0);
}
`;

export const backgroundFragmentShader = /* wgsl */ `
struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
  // Calculate distance from center in pixels
  let centerX = uniforms.screenWidth / 2.0;
  let centerY = uniforms.screenHeight / 2.0;
  let dx = fragCoord.x - centerX;
  let dy = fragCoord.y - centerY;

  // Use the smaller dimension for radius reference (circular)
  let refSize = min(uniforms.screenWidth, uniforms.screenHeight);
  let dist = sqrt(dx * dx + dy * dy) / refSize;

  // Radial gradient: subtle glow in center, dark at edges (soft/blurred)
  let centerBrightness = 0.12;
  let edgeBrightness = 0.02;
  let falloff = smoothstep(0.1, 0.7, dist);
  let brightness = mix(centerBrightness, edgeBrightness, falloff);

  return vec4f(vec3f(brightness), 1.0);
}
`;

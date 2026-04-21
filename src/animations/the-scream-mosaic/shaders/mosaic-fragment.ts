export const mosaicFragmentShader = /* wgsl */ `
struct Uniforms {
  canvasWidth: f32,
  canvasHeight: f32,
  atlasWidth: f32,
  atlasHeight: f32,
  contrast: f32,
  time: f32,
}

struct FragmentInput {
  @builtin(position) fragCoord: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var atlasTexture: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  // Sample the atlas texture
  let color = textureSample(atlasTexture, atlasSampler, input.uv);

  // Apply contrast boost (matches Skia ColorMatrix: contrast = 1.4)
  let contrast = uniforms.contrast;
  let offset = 0.5 * (1.0 - contrast);
  let boosted = color.rgb * contrast + vec3f(offset);

  return vec4f(clamp(boosted, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

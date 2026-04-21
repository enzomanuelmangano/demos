export const mosaicFragmentShader = /* wgsl */ `
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

struct FragmentInput {
  @builtin(position) fragCoord: vec4f,
  @location(0) atlasUV: vec2f,
  @location(1) highResUV: vec2f,
  @location(2) highResSlot: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var atlasTexture: texture_2d<f32>;
@group(0) @binding(3) var atlasSampler: sampler;
@group(0) @binding(4) var highResTexture: texture_2d<f32>;
@group(0) @binding(5) var highResSampler: sampler;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let color = textureSample(atlasTexture, atlasSampler, input.atlasUV);

  // Apply contrast boost
  let contrast = uniforms.contrast;
  let offset = 0.5 * (1.0 - contrast);
  let boosted = color.rgb * contrast + vec3f(offset);

  return vec4f(clamp(boosted, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

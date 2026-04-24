export const mosaicFragmentShader = /* wgsl */ `
struct Uniforms {
  screenWidth: f32,
  screenHeight: f32,
  focusedX: f32,
  focusedY: f32,
  atlasWidth: f32,
  atlasHeight: f32,
  contrast: f32,
  time: f32,
  scale: f32,
  translateX: f32,
  translateY: f32,
  animProgress: f32,
  atlasReveal: f32,
  cellWidth: f32,
  cellHeight: f32,
  focusIntensity: f32,
}

struct FragmentInput {
  @builtin(position) fragCoord: vec4f,
  @location(0) atlasUV: vec2f,
  @location(1) @interpolate(flat) atlasIndex: u32,
  @location(2) @interpolate(flat) focusDim: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(2) var atlasTexture0: texture_2d<f32>;
@group(0) @binding(3) var atlasTexture1: texture_2d<f32>;
@group(0) @binding(4) var atlasTexture2: texture_2d<f32>;
@group(0) @binding(5) var atlasTexture3: texture_2d<f32>;
@group(0) @binding(6) var atlasTexture4: texture_2d<f32>;
@group(0) @binding(7) var atlasTexture5: texture_2d<f32>;
@group(0) @binding(8) var atlasTexture6: texture_2d<f32>;
@group(0) @binding(9) var atlasSampler: sampler;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  // Sample all atlases first (uniform control flow required by WGSL)
  let color0 = textureSample(atlasTexture0, atlasSampler, input.atlasUV);
  let color1 = textureSample(atlasTexture1, atlasSampler, input.atlasUV);
  let color2 = textureSample(atlasTexture2, atlasSampler, input.atlasUV);
  let color3 = textureSample(atlasTexture3, atlasSampler, input.atlasUV);
  let color4 = textureSample(atlasTexture4, atlasSampler, input.atlasUV);
  let color5 = textureSample(atlasTexture5, atlasSampler, input.atlasUV);
  let color6 = textureSample(atlasTexture6, atlasSampler, input.atlasUV);

  // Select based on atlas index
  var color: vec4f;
  if (input.atlasIndex == 0u) {
    color = color0;
  } else if (input.atlasIndex == 1u) {
    color = color1;
  } else if (input.atlasIndex == 2u) {
    color = color2;
  } else if (input.atlasIndex == 3u) {
    color = color3;
  } else if (input.atlasIndex == 4u) {
    color = color4;
  } else if (input.atlasIndex == 5u) {
    color = color5;
  } else {
    color = color6;
  }

  // Apply contrast boost
  let contrast = uniforms.contrast;
  let offset = 0.5 * (1.0 - contrast);
  var boosted = color.rgb * contrast + vec3f(offset);

  // Apply focus dimming (focusDim = 0 for focused cell, 0.8 for others)
  boosted = boosted * (1.0 - input.focusDim);

  return vec4f(clamp(boosted, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

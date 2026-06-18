export const vertexShader = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4f,
  lightDir: vec4f,
  camPos: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@vertex
fn main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VertexOutput {
  var out: VertexOutput;
  out.position = uniforms.viewProj * vec4f(position, 1.0);
  out.worldPos = position;
  out.normal = normal;
  return out;
}
`;

export const fragmentShader = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4f,
  lightDir: vec4f,
  camPos: vec4f,
}

struct FragmentInput {
  @builtin(position) fragCoord: vec4f,
  @builtin(front_facing) frontFacing: bool,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  // Two-sided: flip the normal toward the camera so both paper faces shade.
  var n = normalize(input.normal);
  let viewDir = normalize(uniforms.camPos.xyz - input.worldPos);
  let facingCam = dot(n, viewDir);
  if (facingCam < 0.0) {
    n = -n;
  }

  // Soft directional sheen gives flat paper a gentle gradient; folded flaps,
  // whose normals tilt, pick up a clear shade step at each crease.
  let lightDir = normalize(uniforms.lightDir.xyz);
  let diffuse = max(dot(n, lightDir), 0.0);
  let shade = 0.82 + 0.18 * diffuse;

  // White paper on top, a slightly cooler grey underside.
  let frontPaper = vec3f(0.985, 0.985, 0.975);
  let backPaper = vec3f(0.86, 0.88, 0.89);
  let isFront = facingCam >= 0.0;
  let paper = select(backPaper, frontPaper, isFront);

  var lit = paper * shade;

  // Very subtle paper grain.
  let g = fract(sin(dot(input.fragCoord.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  lit = lit + (g - 0.5) * 0.012;

  return vec4f(clamp(lit, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

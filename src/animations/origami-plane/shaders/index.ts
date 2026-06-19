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
  @builtin(vertex_index) vid: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> VertexOutput {
  var out: VertexOutput;
  var clip = uniforms.viewProj * vec4f(position, 1.0);
  // Stacked paper layers are coincident in depth → z-fighting. Pull each
  // triangle a hair toward the camera by its draw order (later faces win),
  // perspective-correct via *w. This is pure depth — no screen-space motion,
  // so coplanar facets never split open into cracks.
  let tri = f32(vid / 3u);
  clip.z = clip.z - tri * 1.5e-5 * clip.w;
  out.position = clip;
  out.worldPos = position;
  out.normal = normal;
  return out;
}
`;

// Planar projected shadow: flatten the same mesh onto a ground plane along the
// light direction, drawn dark + translucent so the crane reads as grounded.
export const GROUND_Y = -0.66;

export const shadowVertexShader = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4f,
  lightDir: vec4f,
  camPos: vec4f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
) -> @builtin(position) vec4f {
  let h = ${GROUND_Y};
  // Near-vertical light for the shadow so it tucks directly under the crane as
  // a contact shadow (a steep angle keeps it from drifting off like a twin).
  let L = normalize(vec3f(0.12, 1.0, 0.08));
  let t = (position.y - h) / L.y;
  let s = vec3f(position.x - L.x * t, h, position.z - L.z * t);
  return uniforms.viewProj * vec4f(s, 1.0);
}
`;

export const shadowFragmentShader = /* wgsl */ `
@fragment
fn main() -> @location(0) vec4f {
  // Low alpha: overlapping projected layers accumulate, so the shadow is
  // naturally denser under the body and soft at the edges.
  return vec4f(0.05, 0.13, 0.13, 0.05);
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

  // Key light + soft fill from the opposite side, so each folded facet reads
  // with clear but gentle form shading (paper-like, never crushed to black).
  let lightDir = normalize(uniforms.lightDir.xyz);
  let fillDir = normalize(vec3f(-lightDir.x, 0.35, -lightDir.z));
  let key = max(dot(n, lightDir), 0.0);
  let fill = max(dot(n, fillDir), 0.0);
  let ambient = 0.42;
  let shade = ambient + 0.5 * key + 0.16 * fill;

  // White paper on the lit side, a slightly cooler grey underside.
  let frontPaper = vec3f(0.98, 0.98, 0.97);
  let backPaper = vec3f(0.88, 0.90, 0.92);
  let isFront = facingCam >= 0.0;
  let paper = select(backPaper, frontPaper, isFront);

  var lit = paper * shade;

  // Gentle rim to separate overlapping layers against the background.
  let rim = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  lit = lit + rim * 0.06;

  // Very subtle paper grain.
  let g = fract(sin(dot(input.fragCoord.xy, vec2f(12.9898, 78.233))) * 43758.5453);
  lit = lit + (g - 0.5) * 0.015;

  return vec4f(clamp(lit, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

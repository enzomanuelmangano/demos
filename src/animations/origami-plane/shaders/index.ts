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
  @location(2) uv: vec2f,
}

@vertex
fn main(
  @builtin(vertex_index) vid: u32,
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VertexOutput {
  var out: VertexOutput;
  var clip = uniforms.viewProj * vec4f(position, 1.0);
  // Stacked paper layers sit at nearly the same depth and z-fight. Resolve by
  // the real stacking height: a layer that is physically higher (greater y)
  // wins, which matches how a folded flap rests on the sheet beneath it. A
  // tiny per-triangle term only breaks exact ties (e.g. the flat bird base,
  // where every layer is coplanar). Pure depth, perspective-correct via *w, so
  // no screen-space motion and no cracks.
  let tri = f32(vid / 3u);
  clip.z = clip.z - (position.y * 0.06 + tri * 2.0e-6) * clip.w;
  out.position = clip;
  out.worldPos = position;
  out.normal = normal;
  out.uv = uv;
  return out;
}
`;

// Planar projected shadow: flatten the same mesh onto a ground plane along the
// SAME light direction used to shade the paper, so the shadow is consistent
// with the lighting. The ground height rides just under the model (lightDir.w),
// so it stays a contact shadow at every step instead of floating far below.
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
  let h = uniforms.lightDir.w;
  let L = normalize(uniforms.lightDir.xyz);
  let t = (position.y - h) / max(L.y, 0.2);
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
  @location(2) uv: vec2f,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

// --- value noise + fbm in paper-UV space (stays glued to the sheet) ---
fn hash2(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}
fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash2(i);
  let b = hash2(i + vec2f(1.0, 0.0));
  let c = hash2(i + vec2f(0.0, 1.0));
  let d = hash2(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
fn fbm(p: vec2f) -> f32 {
  var v = 0.0;
  var a = 0.5;
  var q = p;
  for (var i = 0; i < 4; i = i + 1) {
    v = v + a * vnoise(q);
    q = q * 2.02;
    a = a * 0.5;
  }
  return v;
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  // Two-sided: flip the normal toward the camera so both paper faces shade.
  var n = normalize(input.normal);
  let viewDir = normalize(uniforms.camPos.xyz - input.worldPos);
  let facingCam = dot(n, viewDir);
  if (facingCam < 0.0) {
    n = -n;
  }
  let isFront = facingCam >= 0.0;

  // ---- paper material in sheet space ----
  let uv = input.uv;
  // Soft cloudy thickness variation (low frequency mottle).
  let mottle = fbm(uv * 7.0);
  // Directional fibre streaks: stretch the noise along one axis so it reads as
  // pressed paper grain, not random speckle.
  let fibre = fbm(vec2f(uv.x * 220.0, uv.y * 26.0));
  let speck = vnoise(uv * 900.0);

  // Warm off-white paper, tinted very slightly by the mottle.
  var albedo = vec3f(0.955, 0.945, 0.915);
  albedo = albedo + (mottle - 0.5) * vec3f(0.05, 0.045, 0.05);
  albedo = albedo - (fibre - 0.5) * 0.05;
  albedo = albedo - (speck - 0.5) * 0.02;
  // Same white sheet on both sides — the back is only a hair cooler, so a fold
  // never reads as grey cardboard. Real separation comes from the lighting.
  albedo = select(albedo * vec3f(0.965, 0.975, 0.985), albedo, isFront);

  // Crease memory: the preliminary-base creases live in sheet space, so they
  // fold with the paper and show on every facet. Each crease is revealed only
  // once the fold that creates it happens — camPos.w carries raw fold progress
  // and each line fades in over its own step (so you never see a crease before
  // making it). Once formed, it persists.
  let p = uniforms.camPos.w;
  let cw = 0.006;
  // Crease orientation follows the fold's rotation axis (verified from the
  // geometry), not the label wording:
  // step 1 folds about the x-axis  → crease runs along x, i.e. the v = 0.5 line
  let cH = (1.0 - smoothstep(0.0, cw, abs(uv.y - 0.5))) * smoothstep(0.0, 1.0, p);
  // step 3 folds about the z-axis  → crease runs along z, i.e. the u = 0.5 line
  let cV = (1.0 - smoothstep(0.0, cw, abs(uv.x - 0.5))) * smoothstep(2.0, 3.0, p);
  // step 5: bottom-left → top-right    → diagonal u + v = 1
  let cD1 = (1.0 - smoothstep(0.0, cw, abs(uv.x + uv.y - 1.0) * 0.7071)) * smoothstep(4.0, 5.0, p);
  // step 7: bottom-right → top-left    → diagonal u = v
  let cD2 = (1.0 - smoothstep(0.0, cw, abs(uv.x - uv.y) * 0.7071)) * smoothstep(6.0, 7.0, p);
  let crease = max(max(cV, cH), max(cD1, cD2));
  albedo = albedo * (1.0 - crease * 0.10);

  // Perturb the normal slightly with the fibre so light catches the grain.
  let grad = vec2f(
    fbm(uv * 7.0 + vec2f(0.04, 0.0)) - mottle,
    fbm(uv * 7.0 + vec2f(0.0, 0.04)) - mottle,
  );
  var nb = normalize(n + vec3f(grad.x, 0.0, grad.y) * 0.6);

  // Key light + soft fill, gentle so facets read as matte paper, never glossy.
  let lightDir = normalize(uniforms.lightDir.xyz);
  let fillDir = normalize(vec3f(-lightDir.x, 0.35, -lightDir.z));
  let key = max(dot(nb, lightDir), 0.0);
  let fill = max(dot(nb, fillDir), 0.0);

  // Thin-paper translucency: light bleeds through, so faces angled away from the
  // light still pick up a soft warm glow instead of going flat/dark.
  let trans = pow(max(dot(-nb, lightDir), 0.0), 2.0) * 0.12;

  // Bright matte white paper: high ambient floor so no facet crushes to grey,
  // with a gentle key for form.
  let ambient = 0.62;
  let shade = ambient + 0.34 * key + 0.12 * fill + trans;

  var lit = albedo * shade;

  // Broad, faint sheen — paper has a soft matte sheen, not a sharp highlight.
  let h = normalize(lightDir + viewDir);
  let sheen = pow(max(dot(nb, h), 0.0), 18.0) * 0.04;
  lit = lit + sheen;

  // Gentle rim to separate overlapping layers against the background.
  let rim = pow(1.0 - max(dot(nb, viewDir), 0.0), 3.0);
  lit = lit + rim * 0.05;

  return vec4f(clamp(lit, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

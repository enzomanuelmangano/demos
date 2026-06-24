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
  // Two-part bias: physical stacking height (higher y rests on top) plus a
  // draw-order tiebreak (the fold engine emits triangles bottom→top) that wins
  // when layers are exactly coplanar. Both were far too weak before, so stacked
  // sheets z-fought and the top flap merged into the one below during a fold.
  clip.z = clip.z - (position.y * 0.14 + tri * 1.4e-4) * clip.w;
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
  // Project along the SAME light that shades the paper, so the ground shadow
  // falls in the direction the light implies — consistent with the key and the
  // inter-layer contact shadow.
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

const PI = 3.14159265;

fn pow5(x: f32) -> f32 {
  let x2 = x * x;
  return x2 * x2 * x;
}

// Disney/Burley diffuse factor (no albedo, no /pi — folded into intensity).
// Roughness-dependent grazing retroreflection: matte paper reads flatter and a
// touch brighter at oblique angles instead of edge-darkening like flat Lambert.
fn disneyDiffuse(NoV: f32, NoL: f32, LoH: f32, rough: f32) -> f32 {
  let fd90 = 0.5 + 2.0 * rough * LoH * LoH;
  let fl = 1.0 + (fd90 - 1.0) * pow5(1.0 - NoL);
  let fv = 1.0 + (fd90 - 1.0) * pow5(1.0 - NoV);
  return fl * fv;
}

// Conty-Kulla "Charlie" sheen distribution (fibrous grazing rim).
fn charlieD(rough: f32, NoH: f32) -> f32 {
  let invR = 1.0 / max(rough, 0.07);
  let sin2 = max(1.0 - NoH * NoH, 0.0);
  return (2.0 + invR) * pow(sin2, invR * 0.5) / (2.0 * PI);
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
  // Diagonal fold axes verified against the baked frames (which line stays fixed
  // during each fold), NOT the label wording:
  // step 5 fold keeps the main diagonal fixed → crease u = v
  let cD1 = (1.0 - smoothstep(0.0, cw, abs(uv.x - uv.y) * 0.7071)) * smoothstep(4.0, 5.0, p);
  // step 7 fold keeps the anti-diagonal fixed → crease u + v = 1
  let cD2 = (1.0 - smoothstep(0.0, cw, abs(uv.x + uv.y - 1.0) * 0.7071)) * smoothstep(6.0, 7.0, p);
  let crease = max(max(cV, cH), max(cD1, cD2));
  // Faint memory only — these UV-locked lines don't trace the real fold edges on
  // the finished crane, so keep them a whisper, never bold dark lines.
  albedo = albedo * (1.0 - crease * 0.04);

  // Perturb the normal slightly with the fibre so light catches the grain.
  let grad = vec2f(
    fbm(uv * 7.0 + vec2f(0.04, 0.0)) - mottle,
    fbm(uv * 7.0 + vec2f(0.0, 0.04)) - mottle,
  );
  var nb = normalize(n + vec3f(grad.x, 0.0, grad.y) * 0.6);

  // ---- layered paper lighting ----
  // Paper is a rough matte dielectric. Use Disney diffuse (roughness-dependent
  // grazing retroreflection) for the key, an energy-conserving wrapped cosine
  // for soft thin-sheet light bleed past the terminator, a hemisphere ambient
  // (sky vs ground) that gives every facet its own value for free, and a faint
  // Charlie sheen for the fibre rim. Replaces the old flat 0.62 ambient + plain
  // Lambert that made differently-oriented facets read the same brightness.
  let lightDir = normalize(uniforms.lightDir.xyz);
  let fillDir = normalize(vec3f(-lightDir.x, 0.35, -lightDir.z));
  let H = normalize(lightDir + viewDir);
  let NoV = max(dot(nb, viewDir), 1e-4);
  let NoL = dot(nb, lightDir);
  let NoH = max(dot(nb, H), 0.0);
  let LoH = max(dot(lightDir, H), 0.0);

  let rough = 0.92; // matte printer paper

  // Energy-conserving wrapped key cosine (Filament cloth form, w = 0.5). Softens
  // the terminator and lets light wrap a little around the sheet. NOT * NoL.
  let w = 0.5;
  let wrapNoL = max((NoL + w) / ((1.0 + w) * (1.0 + w)), 0.0);
  let dd = disneyDiffuse(NoV, max(NoL, 0.0), LoH, rough);
  let key = dd * wrapNoL * 0.72;

  let fill = max(dot(nb, fillDir), 0.0) * 0.13;

  // Hemisphere ambient: upward facets catch the (cool) sky, downward facets the
  // dimmer ground. This is what separates the planes of a fold without a real
  // GI/AO pass — the single biggest fix for the "flat cutout" look. The ground
  // term stays light and a touch warm so the undersides read as white paper in
  // a bright room, not grey card.
  let up = nb.y * 0.5 + 0.5;
  let skyAmb = vec3f(0.52, 0.54, 0.58);
  let groundAmb = vec3f(0.36, 0.34, 0.32);
  let ambient = mix(groundAmb, skyAmb, up);

  // Thin-paper translucency: faces pointing away from the light still glow warm
  // as light bleeds through the sheet instead of crushing to grey.
  let trans = pow(max(dot(-nb, lightDir), 0.0), 3.0) * 0.16;

  var lit = albedo * (ambient + key + fill) + trans * vec3f(1.0, 0.95, 0.88);

  // Charlie sheen — fibrous grazing rim, gated by the key so it never lifts the
  // shadow side and never blows the white out.
  let sheen = charlieD(0.5, NoH) * wrapNoL * 0.10;
  lit = lit + sheen;

  // Gentle rim to separate overlapping layers against the background.
  let rim = pow(1.0 - NoV, 3.0);
  lit = lit + rim * 0.04;

  return vec4f(clamp(lit, vec3f(0.0), vec3f(1.0)), 1.0);
}
`;

export const fragmentShader = /* wgsl */ `
struct FragmentInput {
  @builtin(position) fragCoord: vec4f,
  @location(0) color: vec3f,
  @location(1) shade: f32,
  @location(2) isBase: f32,
  @location(3) progress: f32,
  @location(4) isTop: f32,
  @location(5) heightFrac: f32,
  @location(6) edgeDist: f32,
  @location(7) topRim: f32,
  @location(8) shadowCast: f32,
  @location(9) peakLift: f32,
  @location(10) rimLight: f32,
  @location(11) valleyAO: f32,
  @location(12) fresnel: f32,
  @location(13) time: f32,
}

// Robust hash for film grain - handles large screen coordinates
fn hash(p: vec2f) -> f32 {
  let p2 = fract(p * vec2f(0.1031, 0.1030));
  let p3 = p2 + dot(p2, p2.yx + 19.19);
  return fract((p3.x + p3.y) * p3.x);
}

@fragment
fn main(input: FragmentInput) -> @location(0) vec4f {
  let bg = vec3f(0.976, 0.965, 0.945);

  let toneLo = vec3f(0.965, 0.963, 0.958);
  let toneHi = vec3f(1.0, 0.998, 0.993);
  let tone = mix(toneLo, toneHi, pow(input.shade, mix(0.78, 0.86, input.progress)));
  let lift = mix(0.94, 1.0, input.shade);
  var lit = input.color * mix(tone * lift, vec3f(1.0), input.progress);

  let canopy = mix(vec3f(1.0), vec3f(1.04, 1.03, 1.02), input.isTop);
  lit = lit * mix(canopy, vec3f(1.0), input.progress);

  let peakShade = mix(0.94, 1.07, input.peakLift);
  lit = lit * mix(1.0, peakShade, (1.0 - input.progress) * input.isTop);

  let rimDark = mix(1.0, 0.9, pow(input.topRim, 1.2));
  lit = lit * mix(rimDark, 1.0, input.progress);

  // Contact shadows at base of blocks
  let contact = mix(0.88, 1.0, smoothstep(0.0, 0.7, input.heightFrac));
  lit = lit * mix(contact, 1.0, input.progress);

  // Cast shadows from taller neighbors
  let castSoft = mix(1.0, input.shadowCast, 0.58);
  lit = lit * mix(castSoft, 1.0, input.progress);

  // Enhanced lighting effects - only in 3D view
  let depthFactor = 1.0 - input.progress;

  if (depthFactor > 0.01) {
    // Rim/backlight
    lit = lit * (1.0 + input.rimLight * 0.25 * depthFactor);

    // Valley AO
    lit = lit * (1.0 - input.valleyAO * 0.32 * depthFactor);

    // Fresnel
    lit = lit * (1.0 + input.fresnel * 0.14 * depthFactor);

    // Color temperature
    let heightT = smoothstep(0.0, 1.0, input.heightFrac);
    let warmShift = vec3f(1.04, 1.01, 0.96);
    let coolShift = vec3f(0.97, 0.99, 1.03);
    let tempShift = mix(coolShift, warmShift, heightT);
    lit = lit * mix(vec3f(1.0), tempShift, 0.35 * depthFactor);

    // Peak glow
    let peakGlow = smoothstep(0.5, 1.0, input.peakLift);
    lit = mix(lit, lit * vec3f(1.08, 1.06, 1.02), peakGlow * 0.4 * depthFactor * input.isTop);

    // Atmospheric haze
    let hazeAmount = (1.0 - heightT) * (1.0 - input.peakLift) * depthFactor;
    let litLuma = dot(lit, vec3f(0.299, 0.587, 0.114));
    lit = mix(lit, vec3f(litLuma), 0.15 * hazeAmount);

    // Saturation boost
    let luma = dot(lit, vec3f(0.299, 0.587, 0.114));
    lit = mix(vec3f(luma), lit, 1.04);

    // Edge fade
    let edgeFade = smoothstep(0.38, 0.62, input.edgeDist);
    lit = lit * (1.0 - edgeFade * 0.005);
  }

  let baseFade = mix(0.26, 0.0, input.progress);
  var col = mix(lit, bg, input.isBase * baseFade);

  // Film grain for organic texture
  let grainCoord = input.fragCoord.xy;
  let grain = hash(grainCoord) - 0.5;
  col = col + grain * 0.06;

  return vec4f(col, 1.0);
}
`;

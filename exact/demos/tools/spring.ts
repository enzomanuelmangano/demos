// Reanimated 4's duration spring as Exact's -exact-spring(stiffness, damping, mass).
//
//   bun tools/spring.ts <duration ms> [dampingRatio = 1] [mass = 4]
//
// withSpring({ duration, dampingRatio }) picks the stiffness whose energy, from rest, falls to
// 6e-9 of the start by 1.5 × duration (springUtils.ts calculateNewStiffnessToMatchDuration),
// then damping = 2 ζ √(k m). From rest the fraction does not depend on the distance.
// Defaults are Reanimated 4's (GentleSpringConfig: mass 4; GentleSpringConfigWithDuration:
// dampingRatio 1). A config with stiffness/damping/mass needs no conversion.
const [duration = 550, zeta = 1, m = 4] = process.argv.slice(2).map(Number);
const threshold = 6e-9;
const t = (duration * 1.5) / 1000;
const fraction = (k: number) => {
  const w = Math.sqrt(k / m) * zeta;
  const x = (1 + w * t) * Math.exp(-w * t);
  const v = (1 + w * t) * Math.exp(-w * t) * -w + w * Math.exp(-w * t);
  return (0.5 * k * x * x + 0.5 * m * v * v) / (0.5 * k);
};
let lo = Number.EPSILON, hi = 8e3;
for (let i = 0; i < 200; i++) {
  const mid = (lo + hi) / 2;
  if (fraction(mid) - threshold > 0) lo = mid; else hi = mid;
}
const k = (lo + hi) / 2;
const c = 2 * zeta * Math.sqrt(k * m);
console.log(`-exact-spring(${k.toFixed(1)}, ${c.toFixed(1)}, ${m})`);

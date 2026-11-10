// Prints a CSS `linear()` easing that follows a Reanimated easing to within `tol` of its
// output everywhere (adaptive stops), for Contract transitions and keyframes where a
// cubic-bezier is only close: `bun tools/easing.ts inOutQuad [tol]`.
const curves: Record<string, (t: number) => number> = {
  // Reanimated's Easing.inOut(Easing.quad): the default withTiming curve.
  inOutQuad: t => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  inOutCubic: t => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outCubic: t => 1 - (1 - t) ** 3,
  inCubic: t => t ** 3,
  outQuad: t => 1 - (1 - t) ** 2,
  inQuad: t => t * t,
  outExp: t => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
};
const [name, tolArg] = process.argv.slice(2);
const f = curves[name];
if (!f) throw new Error(`unknown easing ${name}: ${Object.keys(curves).join(', ')}`);
const tol = Number(tolArg ?? 0.0005);
const stops = [0];
// Greedy: extend each segment while every point under it is within tol of the chord.
for (let a = 0; a < 1; ) {
  let b = Math.min(1, a + 0.5);
  const ok = (b: number) => {
    for (let i = 1; i < 64; i++) {
      const t = a + ((b - a) * i) / 64;
      const chord = f(a) + ((f(b) - f(a)) * (t - a)) / (b - a);
      if (Math.abs(chord - f(t)) > tol) return false;
    }
    return true;
  };
  while (!ok(b)) b = a + (b - a) / 1.25;
  stops.push(b);
  a = b;
}
const r = (v: number) => Number(v.toFixed(5));
console.log(`linear(${stops.map(t => `${r(f(t))} ${r(t * 100)}%`).join(', ')})`);
console.error(`${stops.length} stops, max error ${tol}`);

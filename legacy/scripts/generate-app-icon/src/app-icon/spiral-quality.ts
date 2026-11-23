/**
 * Which random spirals make a good icon.
 *
 * The spiral puts point `n` at radius `n / 4` and angle `n · α`, and α is the
 * one random number. What reads as the spiral is not that curve but the
 * nearest-neighbour family: points `q` steps apart that land closest to each
 * other trace `q` arms. Depending on α those arms are a handful of thick
 * ribbons, straight rays, an even dotted texture with no space at all — or
 * what we want: a moderate number of curved arms drawn by close dots, with
 * wide blue gaps between them.
 *
 * Mirrored by spiral-lab.html, where the thresholds were picked by eye.
 */

/** Radii (px, on the 1024 icon) where the pattern is measured. */
const RADII = [250, 400, 550];
/** Neighbour distances searched, in point steps. */
const QMAX = 400;

export const SPIRAL_RULE = {
  /** Gap to the next arm, mid-icon, in px. */
  minSpace: 150,
  minArms: 10,
  maxArms: 20,
  /** How far the arms lean off the radius: 0° is a straight ray. */
  minCurve: 15,
  /** Past this the arms wind into rings. */
  maxCurve: 72,
};

export const angleOf = (randomFactor: number) => (Math.PI * randomFactor) / 2;

export const measureSpiral = (randomFactor: number) => {
  const turns = angleOf(randomFactor) / (2 * Math.PI);
  const at = RADII.map(r => {
    const dist = new Float64Array(QMAX + 1);
    let along = Infinity;
    let arms = 0;
    let leftover = 0;
    for (let q = 1; q <= QMAX; q++) {
      const e = q * turns - Math.round(q * turns);
      const d = Math.hypot(q / 4, r * 2 * Math.PI * e);
      dist[q] = d;
      if (d < along) {
        along = d;
        arms = q;
        leftover = e;
      }
    }
    // The next family that is not the same arms counted twice.
    let across = Infinity;
    for (let q = 1; q <= QMAX; q++) {
      if (q % arms !== 0 && dist[q] < across) across = dist[q];
    }
    const curve =
      (Math.atan2(Math.abs(r * 2 * Math.PI * leftover), arms / 4) * 180) /
      Math.PI;
    return { arms, along, across, curve };
  });
  const mid = at[1];
  // The same arms all the way out; otherwise a second pattern takes over.
  const stable = at.every(m => m.arms === mid.arms);
  return { ...mid, stable };
};

export const isGoodSpiral = (randomFactor: number, rule = SPIRAL_RULE) => {
  const m = measureSpiral(randomFactor);
  return (
    m.stable &&
    m.across >= rule.minSpace &&
    m.arms >= rule.minArms &&
    m.arms <= rule.maxArms &&
    m.curve >= rule.minCurve &&
    m.curve <= rule.maxCurve
  );
};

/**
 * A random factor whose spiral passes the rule. About one draw in two hundred
 * does, so this takes a few hundred cheap measurements, not renders.
 */
export const drawGoodSpiral = (random = Math.random, maxTries = 20000) => {
  for (let i = 0; i < maxTries; i++) {
    const randomFactor = random();
    if (isGoodSpiral(randomFactor)) return randomFactor;
  }
  throw new Error(`No good spiral in ${maxTries} draws`);
};

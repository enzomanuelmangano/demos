// A spring over a whole array of numbers, stepped in one frame callback.
//
// It reproduces what `withSpring(target, { duration, dampingRatio: 1 })` does
// to every element of an animated array (Reanimated 4.5,
// src/animation/spring): the stiffness is solved per element so the spring
// settles in `duration`, a velocity pointing away from the new target is
// dropped, and each element is stepped with the critically damped solution
// until its energy falls below the same threshold.
//
// What it saves: Reanimated solves the stiffness with a bisection for every
// element on every retarget, and steps one animation object per element.
// Starting from rest the solved stiffness does not depend on the displacement
// (the energy ratio it targets cancels it out), so one solve covers every
// element that is at rest; only elements caught mid-flight need their own,
// as before.

// Reanimated's defaults for a duration-based spring.
const MASS = 4;
const ENERGY_THRESHOLD = 6e-9;
const PERCEPTUAL_COEFFICIENT = 1.5;
const MAX_FRAME_MS = 64;

export type SpringArrayState = {
  current: number[];
  velocity: number[];
  target: number[];
  omega0: number[];
  stiffness: number[];
  initialEnergy: number[];
  done: boolean[];
  lastTimestamp: number;
  running: boolean;
};

const getEnergy = (displacement: number, velocity: number, k: number) => {
  'worklet';
  return 0.5 * k * displacement ** 2 + 0.5 * MASS * velocity ** 2;
};

// calculateNewStiffnessToMatchDuration + bisectRoot, for dampingRatio 1.
// It visits exactly the same midpoints and returns the same stiffness, but
// evaluates the energy once per midpoint instead of twice: a retarget
// mid-flight runs this for thousands of coordinates in a single frame.
const solveStiffness = (x0: number, v0: number, durationMs: number) => {
  'worklet';
  const settlingDuration = (durationMs * PERCEPTUAL_COEFFICIENT) / 1000;
  const halfMassV0Squared = 0.5 * MASS * v0 ** 2;
  const x0Squared = x0 ** 2;
  const energyDiff = (stiffness: number) => {
    const omega0 = Math.sqrt(stiffness / MASS);
    const envelope = Math.exp(-omega0 * settlingDuration);
    const a = v0 + x0 * omega0;
    const xtk = (x0 + a * settlingDuration) * envelope;
    const vtk = xtk * -omega0 + a * envelope;
    const e0 = 0.5 * stiffness * x0Squared + halfMassV0Squared;
    const etk = getEnergy(xtk, vtk, stiffness);
    return etk / e0 - ENERGY_THRESHOLD;
  };

  const precision = ENERGY_THRESHOLD * 1e-3;
  let min = Number.EPSILON;
  let max = 8e3;
  const direction = energyDiff(max) >= energyDiff(min) ? 1 : -1;
  let current = (max + min) / 2;
  for (let iterations = 100; iterations > 0; iterations--) {
    const diff = energyDiff(current);
    // Written as !(a > b) so a NaN (x0 = v0 = 0) stops, as bisectRoot does.
    if (!(Math.abs(diff) > precision)) {
      break;
    }
    if (diff * direction < 0) {
      min = current;
    } else {
      max = current;
    }
    current = (min + max) / 2;
  }
  return current;
};

export const createSpringArrayState = (values: number[]): SpringArrayState => {
  'worklet';
  const n = values.length;
  return {
    current: values.slice(),
    velocity: new Array(n).fill(0),
    target: values.slice(),
    omega0: new Array(n).fill(0),
    stiffness: new Array(n).fill(0),
    initialEnergy: new Array(n).fill(0),
    done: new Array(n).fill(true),
    lastTimestamp: 0,
    running: false,
  };
};

// Points every element at its new target, as starting withSpring would.
export const retargetSpringArray = (
  state: SpringArrayState,
  target: number[],
  durationMs: number,
) => {
  'worklet';
  // One solve for every element at rest; its stiffness is independent of
  // the displacement (x0 = 1 stands for any non-zero displacement).
  const restStiffness = solveStiffness(1, 0, durationMs);
  for (let i = 0; i < target.length; i++) {
    const value = state.current[i];
    const toValue = target[i];
    let velocity = state.velocity[i];
    // Inertia is only kept when it already points toward the new target.
    if (
      (toValue > value && velocity < 0) ||
      (toValue < value && velocity > 0)
    ) {
      velocity = 0;
    }
    const x0 = value - toValue;
    const stiffness =
      velocity === 0 && x0 !== 0
        ? restStiffness
        : solveStiffness(x0, velocity, durationMs);
    state.target[i] = toValue;
    state.velocity[i] = velocity;
    state.stiffness[i] = stiffness;
    state.omega0[i] = Math.sqrt(stiffness / MASS);
    // Reanimated measures the initial energy with the config velocity (0).
    state.initialEnergy[i] = getEnergy(x0, 0, stiffness);
    state.done[i] = false;
  }
  if (!state.running) {
    state.lastTimestamp = 0;
  }
  state.running = true;
};

// Advances every element to `now`. Returns false once all are at rest.
export const stepSpringArray = (state: SpringArrayState, now: number) => {
  'worklet';
  if (!state.running) {
    return false;
  }
  const last = state.lastTimestamp || now;
  const t = Math.min(Math.max(now - last, 0), MAX_FRAME_MS) / 1000;
  state.lastTimestamp = now;

  let running = false;
  const { current, velocity, target, omega0, stiffness, initialEnergy, done } =
    state;
  for (let i = 0; i < current.length; i++) {
    if (done[i]) {
      continue;
    }
    const toValue = target[i];
    const x0 = current[i] - toValue;
    const v0 = velocity[i];
    const w = omega0[i];
    const envelope = Math.exp(-w * t);
    const position = toValue + envelope * (x0 + (v0 + w * x0) * t);
    const newVelocity =
      envelope * -w * (x0 + (v0 + w * x0) * t) + envelope * (v0 + w * x0);
    const energy = getEnergy(toValue - position, newVelocity, stiffness[i]);
    if (
      initialEnergy[i] === 0 ||
      energy / initialEnergy[i] <= ENERGY_THRESHOLD
    ) {
      current[i] = toValue;
      velocity[i] = 0;
      done[i] = true;
    } else {
      current[i] = position;
      velocity[i] = newVelocity;
      running = true;
    }
  }
  state.running = running;
  return running;
};

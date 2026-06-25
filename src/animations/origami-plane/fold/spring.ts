// Critically damped spring used to ease `progress` toward the target step.

const SETTLE_DURATION = 1.6; // seconds to ~99% settle — smooth, unhurried fold
const OMEGA = -Math.log(0.01) / SETTLE_DURATION;

export interface SpringState {
  position: number;
  velocity: number;
}

export const springStep = (
  current: number,
  velocity: number,
  target: number,
  dt: number,
): SpringState => {
  const displacement = current - target;
  const decay = Math.exp(-OMEGA * dt);
  const newDisplacement =
    (displacement + (velocity + OMEGA * displacement) * dt) * decay;
  const newVelocity =
    (velocity - OMEGA * (velocity + OMEGA * displacement) * dt) * decay;
  return { position: target + newDisplacement, velocity: newVelocity };
};

export const isSettled = (
  position: number,
  velocity: number,
  target: number,
): boolean =>
  Math.abs(position - target) < 0.0005 && Math.abs(velocity) < 0.005;

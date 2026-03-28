import { SPRING_OMEGA } from '../constants';

export interface SpringState {
  position: number;
  velocity: number;
}

/**
 * Critically damped spring step function.
 * Returns new position and velocity after applying spring physics for dt seconds.
 */
export function springStep(
  current: number,
  velocity: number,
  target: number,
  dt: number,
): SpringState {
  const displacement = current - target;
  const decay = Math.exp(-SPRING_OMEGA * dt);

  // Critically damped: x(t) = (x₀ + (v₀ + ω₀*x₀)*t) * e^(-ω₀*t) + target
  const newDisplacement =
    (displacement + (velocity + SPRING_OMEGA * displacement) * dt) * decay;
  const newVelocity =
    (velocity - SPRING_OMEGA * (velocity + SPRING_OMEGA * displacement) * dt) *
    decay;

  return {
    position: target + newDisplacement,
    velocity: newVelocity,
  };
}

/**
 * Check if spring has effectively settled at target.
 */
export function isSpringSettled(
  position: number,
  velocity: number,
  target: number,
  positionThreshold = 0.001,
  velocityThreshold = 0.01,
): boolean {
  return (
    Math.abs(position - target) < positionThreshold &&
    Math.abs(velocity) < velocityThreshold
  );
}

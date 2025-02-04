/**
 * Configuration constants for the shaking animation
 */
export const SHAKING_ANIMATION = {
  // Animation parameters
  BASE: {
    /** Base amplitude of the horizontal shake in pixels */
    AMPLITUDE: 1,
    /** Random variation added to the base amplitude */
    AMPLITUDE_VARIATION: 0.2,
    /** Base duration of one shake cycle in milliseconds */
    DURATION: 80,
    /** Random variation added to the base duration */
    DURATION_VARIATION: 40,
    /** Base rotation amplitude in degrees */
    ROTATION_AMPLITUDE: 1,
    /** Random variation added to rotation amplitude */
    ROTATION_VARIATION: 2,
    /** Base rotation offset in degrees */
    ROTATION_BASE: -3,
    /** Random variation added to base rotation */
    ROTATION_BASE_VARIATION: 6,
  },
} as const;

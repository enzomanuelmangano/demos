import { CREEPER_FUSE_DURATION } from './constants';

import type { Pattern } from 'react-native-pulsar';

const FUSE_MS = CREEPER_FUSE_DURATION * 1000;

/**
 * The whole detonation as ONE pattern: the fuse's accelerating ticks, the
 * blast, and its rumble tail.
 *
 * Played once when the fuse starts, so every beat is timed by the haptic
 * engine rather than by a chain of setTimeouts that drifts against the
 * animation clock and has to be cleaned up by hand.
 *
 * Two channels doing different jobs. The DISCRETE ticks are the fuse you can
 * count, tightening as the mob primes. The CONTINUOUS channel is the swell
 * underneath them - inaudible on its own, but it is what makes the blast land
 * as a release rather than as one more tap.
 *
 * `frequency` is sharpness, not pitch: the ticks climb towards crisp, and the
 * blast drops to the bottom of the range so it reads as a deep thud rather
 * than a hard click.
 */
export const CREEPER_BLAST_PATTERN: Pattern = {
  discretePattern: [
    // Fuse. Gaps shrink 300ms -> 65ms, so it accelerates INTO the blast.
    // The first version of this used t = fuse * (i/n)^1.7, which widens the
    // gaps instead - the haptic fuse was decelerating while the mob's flash
    // was speeding up.
    { time: 0, amplitude: 0.16, frequency: 0.4 },
    { time: 300, amplitude: 0.18, frequency: 0.43 },
    { time: 560, amplitude: 0.2, frequency: 0.47 },
    { time: 790, amplitude: 0.23, frequency: 0.51 },
    { time: 990, amplitude: 0.26, frequency: 0.56 },
    { time: 1160, amplitude: 0.3, frequency: 0.62 },
    { time: 1310, amplitude: 0.34, frequency: 0.68 },
    { time: 1440, amplitude: 0.39, frequency: 0.75 },
    { time: 1550, amplitude: 0.44, frequency: 0.82 },
    { time: 1645, amplitude: 0.48, frequency: 0.88 },
    { time: 1725, amplitude: 0.52, frequency: 0.94 },
    { time: 1790, amplitude: 0.55, frequency: 1 },
    // The blast, and two fragments of it cracking away.
    { time: FUSE_MS, amplitude: 1, frequency: 0.08 },
    { time: FUSE_MS + 45, amplitude: 0.72, frequency: 0.3 },
    { time: FUSE_MS + 105, amplitude: 0.5, frequency: 0.5 },
  ],
  continuousPattern: {
    amplitude: [
      { time: 0, value: 0 },
      // The swell: barely there at first, tightening as the mob primes.
      { time: 900, value: 0.12 },
      { time: 1500, value: 0.24 },
      { time: FUSE_MS - 10, value: 0.34 },
      // Detonation, then the tail rolling off under the debris.
      { time: FUSE_MS + 5, value: 1 },
      { time: FUSE_MS + 260, value: 0.5 },
      { time: FUSE_MS + 620, value: 0.2 },
      { time: FUSE_MS + 1100, value: 0 },
    ],
    frequency: [
      { time: 0, value: 0.25 },
      { time: FUSE_MS - 10, value: 0.7 },
      // Bottom of the range: a deep thud, not a click.
      { time: FUSE_MS + 5, value: 0.1 },
      { time: FUSE_MS + 1100, value: 0.05 },
    ],
  },
};

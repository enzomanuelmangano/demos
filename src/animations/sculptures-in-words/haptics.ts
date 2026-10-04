import { MORPH_DURATION_MS, STAGGER } from './constants';

import type { Pattern } from 'react-native-pulsar';

/**
 * The page coming apart.
 *
 * One tick per burst of departures, and the departures are spread evenly over
 * the first STAGGER of the morph, so the ticks are too: a steady patter that
 * thins as the last letters go, then nothing while they fly. A rumble under a
 * few thousand letters reads as the phone struggling, not as paper lifting.
 */
const DEPARTURES_MS = MORPH_DURATION_MS * STAGGER;
const TICKS = 14;

export const MORPH_PATTERN: Pattern = {
  discretePattern: Array.from({ length: TICKS }, (_, i) => {
    const t = i / (TICKS - 1);
    return {
      // Ticks bunch at the start and spread out toward the end, like the
      // letters do once the early leavers are gone.
      time: Math.round(DEPARTURES_MS * t * t * 0.5 + DEPARTURES_MS * t * 0.5),
      amplitude: 0.24 - 0.15 * t,
      frequency: 1,
    };
  }),
  continuousPattern: {
    amplitude: [
      { time: 0, value: 0 },
      { time: DEPARTURES_MS, value: 0 },
    ],
    frequency: [
      { time: 0, value: 0.5 },
      { time: DEPARTURES_MS, value: 0.5 },
    ],
  },
};

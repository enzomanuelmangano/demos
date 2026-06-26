import type { Pattern } from 'react-native-pulsar';

// Crisp tickles rippling with the letters — densest as the wave launches,
// thinning as they settle. No continuous channel, so no rumble under the taps.
export const MORPH_PATTERN: Pattern = {
  discretePattern: [
    { time: 0, amplitude: 0.22, frequency: 1 },
    { time: 90, amplitude: 0.18, frequency: 1 },
    { time: 180, amplitude: 0.2, frequency: 1 },
    { time: 280, amplitude: 0.22, frequency: 1 },
    { time: 380, amplitude: 0.2, frequency: 1 },
    { time: 490, amplitude: 0.18, frequency: 1 },
    { time: 610, amplitude: 0.16, frequency: 1 },
    { time: 740, amplitude: 0.15, frequency: 1 },
    { time: 880, amplitude: 0.13, frequency: 1 },
    { time: 1030, amplitude: 0.12, frequency: 1 },
    { time: 1200, amplitude: 0.1, frequency: 1 },
  ],
  continuousPattern: {
    amplitude: [
      { time: 0, value: 0 },
      { time: 1200, value: 0 },
    ],
    frequency: [
      { time: 0, value: 0.5 },
      { time: 1200, value: 0.5 },
    ],
  },
};

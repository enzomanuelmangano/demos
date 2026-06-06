import { Presets } from 'react-native-pulsar';

import type { Pattern } from 'react-native-pulsar';

// Checkmate haptic crescendo, synced to the REAL on-screen timeline (t=0 is
// onMove, which fires as the mating piece STARTS its ~400ms slide; the aura
// snapshot runs at 580ms and the wave launches ~700ms; the recap card mounts
// ~1480ms and blurs into focus by ~1900ms):
//   t=0     a subtle tick as the mating move launches
//   t≈400   THE STRIKE — the piece lands on the board
//   400→680 tension swells out of the landing into the launch
//   t≈700   low detonation as the wave fires
//   →2000   the rumble decays with the expanding ring
//   t≈1950  bright double accent as the recap becomes readable
// One native Core Haptics pattern — scheduled on the engine up front, so the
// main-thread snapshot at 580ms can't delay it.
export const MATE_PATTERN: Pattern = {
  discretePattern: [
    // Heartbeat while the mating piece is in flight — lub-dub, lub-dub.
    { time: 0, amplitude: 0.45, frequency: 0.6 },
    { time: 90, amplitude: 0.25, frequency: 0.5 },
    { time: 240, amplitude: 0.55, frequency: 0.6 },
    { time: 330, amplitude: 0.3, frequency: 0.5 },
    // THE STRIKE — the piece lands, and the board rings from the blow.
    { time: 400, amplitude: 1, frequency: 0.55 },
    { time: 470, amplitude: 0.5, frequency: 0.5 },
    { time: 540, amplitude: 0.3, frequency: 0.45 },
    // Wave detonation — a double hit: the crack and the sub-thump under it.
    { time: 700, amplitude: 1, frequency: 0.35 },
    { time: 760, amplitude: 0.9, frequency: 0.2 },
    // Debris falling with the expanding ring — descending in force and pitch.
    { time: 900, amplitude: 0.55, frequency: 0.5 },
    { time: 1080, amplitude: 0.4, frequency: 0.4 },
    { time: 1280, amplitude: 0.3, frequency: 0.35 },
    { time: 1500, amplitude: 0.2, frequency: 0.3 },
    // Recap focuses — ascending triple, the triumph sting.
    { time: 1900, amplitude: 0.6, frequency: 0.6 },
    { time: 1975, amplitude: 0.75, frequency: 0.8 },
    { time: 2060, amplitude: 0.9, frequency: 1 },
  ],
  continuousPattern: {
    amplitude: [
      { time: 0, value: 0 },
      { time: 380, value: 0.1 }, // near-silent flight under the heartbeat
      { time: 450, value: 0.3 }, // tension out of the landing
      { time: 680, value: 1 }, // peak at the detonation
      { time: 850, value: 0.55 }, // first aftershock trough
      { time: 950, value: 0.7 }, // wobble — the ring still shaking
      { time: 1150, value: 0.4 },
      { time: 1300, value: 0.5 },
      { time: 1700, value: 0.12 }, // tail as the front clears the screen
      { time: 2150, value: 0 },
    ],
    frequency: [
      { time: 0, value: 0.5 },
      { time: 400, value: 0.4 }, // drops low after the strike
      { time: 680, value: 0.9 }, // screams into the detonation
      { time: 800, value: 0.25 }, // collapses into the sub-rumble
      { time: 1400, value: 0.35 },
      { time: 2150, value: 0.3 },
    ],
  },
};

// Tactile read of an ordinary move: a soft tick, firmer on captures, sharp on
// checks. (Mate plays MATE_PATTERN instead — see useChessGame.)
export const moveTick = ({
  capture,
  check,
}: {
  capture: boolean;
  check: boolean;
}) => {
  if (capture) {
    Presets.System.impactMedium();
  } else if (check) {
    Presets.System.impactRigid();
  } else {
    Presets.System.impactLight();
  }
};

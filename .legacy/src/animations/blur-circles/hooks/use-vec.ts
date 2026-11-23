import { useDerivedValue } from 'react-native-reanimated';

import { center } from '../constants';
import { noise2D } from '../worklet-noise';

import type { NoiseTables } from '../worklet-noise';
import type { SharedValue } from 'react-native-reanimated';

type UseVecParams = {
  clock: SharedValue<number>;
  frequency: number;
  amplitude: number;
  noise: NoiseTables;
};

// Returns the x and y coordinates of an animated circle: simplex noise
// sampled along the clock, scaled by the amplitude and centred on screen.
// The noise runs in a worklet, so the circles move without ever touching the
// JS thread.
const useVec = ({ clock, frequency, amplitude, noise }: UseVecParams) => {
  const cx = useDerivedValue(() => {
    return amplitude * noise2D(noise, clock.get() / frequency, 0) + center.x;
  }, [clock, frequency, amplitude, noise]);

  const cy = useDerivedValue(() => {
    return amplitude * noise2D(noise, 0, clock.get() / frequency) + center.y;
  }, [clock, frequency, amplitude, noise]);

  return {
    cx,
    cy,
  };
};

export { useVec };

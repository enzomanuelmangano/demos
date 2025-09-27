import { vec } from '@shopify/react-native-skia';
import { useCallback } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { center } from '../constants';

type UseVecParams = {
  clock: SharedValue<number>;
  frequency: number;
  amplitude: number;
  noise: (x: number, y: number) => number;
};

// This hook is used to retrieve the x and y coordinates of the circle
// that is animated in the example.

// The hook takes in a clock, frequency, amplitude, and noise function
// and returns the x and y coordinates of the circle.

const useVec = ({ clock, frequency, amplitude, noise }: UseVecParams) => {
  const vecNoise = useSharedValue(vec(0, 0));

  const updateVecNoise = useCallback(() => {
    const x = noise(clock.value / frequency, 0);
    const y = noise(0, clock.value / frequency);
    vecNoise.value = vec(amplitude * x, amplitude * y);
  }, [clock, frequency, amplitude, noise, vecNoise]);

  useAnimatedReaction(
    () => clock.value,
    () => {
      scheduleOnRN(updateVecNoise);
    },
    [updateVecNoise],
  );

  // The hook uses the useComputedValue hook to create a computed value
  // that is dependent on the clock. The computed value is a vector
  // that is created by using the noise function to create a value for
  // the x and y coordinates of the vector. The vector is then multiplied
  // by the amplitude to create a larger value. The vector is then added
  // to the center of the screen to create a vector that is centered
  // on the screen.
  const cx = useDerivedValue(() => {
    return vecNoise.value.x + center.x;
  }, [vecNoise]);

  const cy = useDerivedValue(() => {
    return vecNoise.value.y + center.y;
  }, [vecNoise]);

  return {
    cx,
    cy,
  };
};

export { useVec };

import type { SkiaValue } from '@shopify/react-native-skia';
import { useComputedValue, vec } from '@shopify/react-native-skia';

import { center } from '../constants';

type UseVecParams = {
  clock: SkiaValue;
  frequency: number;
  amplitude: number;
  noise: (x: number, y: number) => number;
};

// This hook is used to retrieve the x and y coordinates of the circle
// that is animated in the example.

// The hook takes in a clock, frequency, amplitude, and noise function
// and returns the x and y coordinates of the circle.

const useVec = ({ clock, frequency, amplitude, noise }: UseVecParams) => {
  const firstVecNoise = useComputedValue(() => {
    const x = noise(clock.current / frequency, 0);
    const y = noise(0, clock.current / frequency);

    return vec(amplitude * x, amplitude * y);
  }, [clock]);

  // The hook uses the useComputedValue hook to create a computed value
  // that is dependent on the clock. The computed value is a vector
  // that is created by using the noise function to create a value for
  // the x and y coordinates of the vector. The vector is then multiplied
  // by the amplitude to create a larger value. The vector is then added
  // to the center of the screen to create a vector that is centered
  // on the screen.
  const cx = useComputedValue(() => {
    return firstVecNoise.current.x + center.x;
  }, [firstVecNoise]);

  const cy = useComputedValue(() => {
    return firstVecNoise.current.y + center.y;
  }, [firstVecNoise]);

  return {
    cx,
    cy,
  };
};

export { useVec };

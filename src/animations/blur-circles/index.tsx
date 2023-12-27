import {
  Blur,
  BlurMask,
  Canvas,
  Circle,
  Group,
  rect,
  rrect,
  runTiming,
  SweepGradient,
  useComputedValue,
  useValue,
  vec,
} from '@shopify/react-native-skia';
import { useEffect, useMemo } from 'react';

import { A, FREQUENCY, noise2D, RADIUS, secondNoise2D } from './constants';
import { useVec } from './hooks/use-vec';

export const BlurCircles = () => {
  // Approach: 1 (using useClockValue) - quite laggy in debug mode
  // const clock = useValue(0);

  // useEffect(() => {
  //   runTiming(
  //     clock,
  //     {
  //       to: 10000,
  //       loop: true,
  //       yoyo: true,
  //     },
  //     {
  //       duration: 10000,
  //     }
  //   );
  // }, []);

  // Approach: 2
  const clock = useValue(0);

  useEffect(() => {
    runTiming(
      clock,
      {
        to: 20000,
        loop: true,
        yoyo: true,
      },
      {
        duration: 20000,
      },
    );
  }, [clock]);
  //

  // This will be the center of the colored circle.
  const { cx, cy } = useVec({
    clock,
    frequency: FREQUENCY,
    amplitude: A,
    noise: noise2D,
  });

  // As you can see, I've chosen different frequencies and
  // amplitudes for the two circles.
  // I've also used different noise functions.
  // This will be the center of the blurred circle.
  const { cx: cx2, cy: cy2 } = useVec({
    clock,
    frequency: FREQUENCY * 2,
    amplitude: A * 3,
    noise: secondNoise2D,
  });

  // This is the clip path of the blurred circle.
  // Basically that's just a path that has the same shape as the blurred circle.
  // That's super useful for clipping the colored circle,
  // with the shape of the blurred circle.
  const clipCircle = useComputedValue(() => {
    return rrect(
      rect(cx2.current - RADIUS, cy2.current - RADIUS, RADIUS * 2, RADIUS * 2),
      RADIUS,
      RADIUS,
    );
  }, [cx2, cy2]);

  const sweepGradient = useMemo(() => {
    return (
      <SweepGradient
        c={vec(50, 128)}
        colors={['cyan', 'magenta', 'yellow', 'cyan']}
      />
    );
  }, []);

  return (
    <Canvas style={{ flex: 1, backgroundColor: 'white' }}>
      {/* Note:  
          I've used two groups here, both for the colored circle,
          both are clipped with the blurred circle's clip path.
          The first group has a blur effect applied to it.
          The second group is inverted in order to get the part that isn't blurred.
      */}
      <Group clip={clipCircle}>
        <Circle cx={cx} cy={cy} r={RADIUS}>
          {sweepGradient}
        </Circle>
        <Blur blur={10} />
      </Group>
      <Group clip={clipCircle} invertClip>
        <Circle cx={cx} cy={cy} r={RADIUS}>
          {sweepGradient}
        </Circle>
      </Group>
      {/* The "Glass Circle" */}
      <Circle
        cx={cx2}
        cy={cy2}
        r={RADIUS}
        color={'rgba(0,0,0,0.08)'}
        strokeWidth={10}
        strokeCap={'round'}>
        <BlurMask blur={20} style="inner" />
      </Circle>
      {/* That's a very simple white stroke added to the blurred circle. 
          Feel free to remove it :)  */}
      <Circle
        cx={cx2}
        cy={cy2}
        r={RADIUS}
        color={'rgba(255,255,255,0.25)'}
        strokeWidth={1}
        style={'stroke'}
      />
    </Canvas>
  );
};

import {
  BlurMask,
  Group,
  SweepGradient,
  vec,
  Circle as SkiaCircle,
} from '@shopify/react-native-skia';
import React, { useEffect } from 'react';
import { useWindowDimensions } from 'react-native';
import {
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

const CircleStroke = React.memo(() => {
  const { width, height } = useWindowDimensions();

  const { size } = {
    size: { current: { width: width * 2, height: height * 0.9 } },
  };

  const cx = useDerivedValue(() => {
    return size.current.width / 4;
  }, [size]);

  const cy = useDerivedValue(() => {
    return size.current.height / 4 + 20;
  }, [size]);

  const sweepGradientCenter = useDerivedValue(() => {
    return vec(cx.value, cy.value);
  }, [cx, cy]);

  const r = useDerivedValue(() => {
    return size.current.height / 7.5;
  }, [size]);

  const blur = useSharedValue(0);

  useEffect(() => {
    blur.value = withSequence(
      withTiming(10, { duration: 4000 }),
      withTiming(45, { duration: 4000 }),
      withTiming(10, { duration: 4000 }),
    );
  }, [blur]);

  return (
    <Group>
      <SkiaCircle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={25}>
        <SweepGradient
          c={sweepGradientCenter}
          colors={[
            'yellow',
            'cyan',
            'cyan',
            '#3C91E6',
            'magenta',
            'orange',
            'yellow',
          ]}
        />
      </SkiaCircle>
      <BlurMask blur={blur} style="solid" />
    </Group>
  );
});

export { CircleStroke };

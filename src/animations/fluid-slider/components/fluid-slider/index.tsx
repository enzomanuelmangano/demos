import { StyleSheet, Text as RNText, View } from 'react-native';

import { useMemo, useState } from 'react';

import {
  Blur,
  Circle,
  ColorMatrix,
  Extrapolate,
  Group,
  Paint,
  Text,
  interpolate,
  useFont,
} from '@shopify/react-native-skia';
import { useAnimatedReaction, useDerivedValue } from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import { usePickerLayout } from './hooks/use-picker-layout';

type FluidSliderProps = {
  color?: string;
  width: number;
  height: number;
};

const DISTANCE_BETWEEN_SLIDER_AND_METABALL = 10;

const FluidSlider: React.FC<FluidSliderProps> = ({
  width,
  height,
  color = '#007AFF',
}) => {
  const size = useMemo(() => {
    return {
      width,
      height,
    };
  }, [width, height]);

  const sliderSize = useMemo(() => {
    return {
      width: width * 0.95,
      height: height,
    };
  }, [width, height]);

  const metaballRadius = useDerivedValue(() => {
    return Math.min(
      20,
      (height - DISTANCE_BETWEEN_SLIDER_AND_METABALL / 2) / 3,
    );
  }, [height]);

  const pickerCircleTextContainerRadius = useDerivedValue(() => {
    return metaballRadius.get() * 0.8;
  }, [metaballRadius]);

  const layer = useMemo(() => {
    return (
      <Paint>
        <Blur blur={4} />
        <ColorMatrix
          matrix={[
            1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 50, -25,
          ]}
        />
      </Paint>
    );
  }, []);

  const sliderHeight = useDerivedValue(() => {
    return 12;
  }, []);

  const { clampedPickerX, isSliding, pickerX, pickerY } = usePickerLayout({
    radius: metaballRadius,
    sliderSize: sliderSize,
  });

  const gestureHandler = useGestureHandler({
    onStart: ({ x }) => {
      'worklet';
      pickerX.set(x);
      isSliding.set(true);
    },
    onActive: ({ x }) => {
      'worklet';
      pickerX.set(x);
    },
    onEnd: () => {
      'worklet';
      isSliding.set(false);
    },
  });

  const fontSize = 12;

  const font = useFont(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../../../assets/fonts/outfit.ttf'),
    fontSize,
  );

  const pickerCircleText = useDerivedValue(() => {
    return Math.round(
      interpolate(
        clampedPickerX.get(),
        [metaballRadius.get(), sliderSize.width - metaballRadius.get()],
        [0, 100],
        Extrapolate.CLAMP,
      ),
    ).toString();
  }, [clampedPickerX, metaballRadius, sliderSize]);

  const pickerTextX = useDerivedValue(() => {
    if (!font) return 0;
    return (
      clampedPickerX.get() - font.measureText(pickerCircleText.get()).width / 2
    );
  }, [clampedPickerX, pickerCircleTextContainerRadius, font, pickerCircleText]);

  const derivedPickerY = useDerivedValue(() => {
    return height / 2;
  }, [height]);

  const textY = useDerivedValue(() => {
    return pickerY.get() + fontSize / 3;
  }, [derivedPickerY, fontSize]);

  const roundedRectY = useDerivedValue(() => {
    return derivedPickerY.get() - sliderHeight.get() / 2 + 1;
  }, [derivedPickerY, sliderHeight]);

  // e2e outcome probe: bridges the worklet-driven slider value to a JS flag so
  // a test can assert the drag actually changed the value (Skia has no
  // inspectable state). Flips to "moved" once sliding begins.
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');
  useAnimatedReaction(
    () => isSliding.get(),
    sliding => {
      if (sliding) {
        scheduleOnRN(setStatus, 'moved');
      }
    },
    [],
  );

  return (
    <View testID="fluid-slider-knob" style={size}>
      <RNText testID="fluid-slider-status" style={localStyles.statusProbe}>
        {`slider:${status}`}
      </RNText>
      <Touchable.Canvas
        style={{
          ...size,
          height: size.height,
          transform: [{ translateX: (size.width - sliderSize.width) / 2 }],
        }}>
        <Group>
          <Group layer={layer}>
            <Touchable.RoundedRect
              x={0}
              y={roundedRectY}
              width={sliderSize.width}
              height={sliderHeight}
              r={6}
              color={color}
              {...gestureHandler}
            />
            <Circle
              cx={clampedPickerX}
              cy={pickerY}
              r={metaballRadius}
              color={color}
            />
          </Group>
          <Circle
            cx={clampedPickerX}
            cy={pickerY}
            r={pickerCircleTextContainerRadius}
            color={'white'}
          />
          {font && (
            <Text
              x={pickerTextX}
              y={textY}
              text={pickerCircleText}
              font={font}
            />
          )}
        </Group>
      </Touchable.Canvas>
    </View>
  );
};

const localStyles = StyleSheet.create({
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: '#000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 1,
  },
});

export { FluidSlider };

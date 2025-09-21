// Importing necessary modules and components
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
import { useMemo } from 'react';
import { useDerivedValue } from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

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

  // Computed value for the radius of the metaball
  const metaballRadius = useDerivedValue(() => {
    return Math.min(
      20,
      (height - DISTANCE_BETWEEN_SLIDER_AND_METABALL / 2) / 3,
    );
  }, [height]);

  // Computed value for the radius of the picker circle text container
  const pickerCircleTextContainerRadius = useDerivedValue(() => {
    return metaballRadius.value * 0.8;
  }, [metaballRadius]);

  // That's the trick behind the "Metaball effect"
  // Feel free to checkout my Video tutorial on YouTube: https://youtu.be/HOxZegqnDC4
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

  // Computed value for the height of the slider
  const sliderHeight = useDerivedValue(() => {
    return 12; // Better thickness for slider track
  }, []);

  // Custom hook for layout calculations
  const { clampedPickerX, isSliding, pickerX, pickerY } = usePickerLayout({
    radius: metaballRadius,
    sliderSize: sliderSize,
  });

  // Gesture handler for handling slider interactions
  const gestureHandler = useGestureHandler({
    onStart: ({ x }) => {
      'worklet';
      pickerX.value = x;
      // This property is used in the usePickerLayout hook
      // to move the picker circle up and down
      isSliding.value = true;
    },
    onActive: ({ x }) => {
      'worklet';
      pickerX.value = x;
    },
    onEnd: () => {
      'worklet';
      isSliding.value = false;
    },
  });

  // Font size for the picker circle text
  const fontSize = 12;

  // Custom font for the text
  const font = useFont(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../../../assets/fonts/outfit.ttf'),
    fontSize,
  );

  // Computed value for the picker circle text value
  // In a common React Native application you would use
  // The ReText component from Redash or the AnimeableText from react-native-animateable-text
  // But in this case we are using the Text component from react-native-skia
  // And that works in the same way but without the usage of useAnimatedProps
  const pickerCircleText = useDerivedValue(() => {
    return Math.round(
      interpolate(
        clampedPickerX.value,
        // Input range: radius -> width - radius (Since the picker circle can't go outside the slider)
        [metaballRadius.value, sliderSize.width - metaballRadius.value],
        // 0 is the min value of the slider
        // 100 is the max value of the slider
        [0, 100],
        Extrapolate.CLAMP,
      ),
    ).toString();
  }, [clampedPickerX, metaballRadius, sliderSize]);

  // Computed value for the X position of the picker text
  const pickerTextX = useDerivedValue(() => {
    if (!font) return 0;
    // That's the trick for centering the text inside the picker circle
    return clampedPickerX.value - font.getTextWidth(pickerCircleText.value) / 2;
  }, [clampedPickerX, pickerCircleTextContainerRadius, font, pickerCircleText]);

  const derivedPickerY = useDerivedValue(() => {
    return height / 2; // Center the slider track vertically
  }, [height]);

  const textY = useDerivedValue(() => {
    return pickerY.value + fontSize / 3;
  }, [derivedPickerY, fontSize]);

  const roundedRectY = useDerivedValue(() => {
    return derivedPickerY.value - sliderHeight.value / 2 + 1;
  }, [derivedPickerY, sliderHeight]);

  // Rendering the FluidSlider component
  return (
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
            // Why the font size is divided by 3? I have no idea 😅 (But it works)
            // The point is that I need to center the text inside the picker circle
            // And I need a way to get the "fontHeight" / 2 (to center the text vertically)
            // Unfortunately I didn't find a way to get the font height
            y={textY}
            text={pickerCircleText}
            font={font}
          />
        )}
      </Group>
    </Touchable.Canvas>
  );
};

// Exporting the FluidSlider component
export { FluidSlider };

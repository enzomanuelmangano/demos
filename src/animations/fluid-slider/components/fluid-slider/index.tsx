// Importing necessary modules and components
import {
  Blur,
  Circle,
  ColorMatrix,
  Extrapolate,
  Group,
  Paint,
  Selector,
  Text,
  interpolate,
  useComputedValue,
  useFont,
  useValue,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
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
  color = '#1C11A2',
}) => {
  const size = useMemo(() => {
    return {
      width,
      height,
    };
  }, [width, height]);

  // Computed value for the radius of the metaball
  const metaballRadius = useComputedValue(() => {
    return (height - DISTANCE_BETWEEN_SLIDER_AND_METABALL / 2) / 4;
  }, [height]);

  // Computed value for the radius of the picker circle text container
  const pickerCircleTextContainerRadius = useComputedValue(() => {
    return metaballRadius.current * 0.7;
  }, [metaballRadius]);

  // That's the trick behind the "Metaball effect"
  // Feel free to checkout my Video tutorial on YouTube: https://youtu.be/HOxZegqnDC4
  const layer = useMemo(() => {
    return (
      <Paint>
        <Blur blur={10} />
        <ColorMatrix
          matrix={[
            1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 80, -40,
          ]}
        />
      </Paint>
    );
  }, []);

  // Computed value for the height of the slider
  const sliderHeight = useComputedValue(() => {
    return (
      height - metaballRadius.current * 2 - DISTANCE_BETWEEN_SLIDER_AND_METABALL
    );
  }, [height, metaballRadius]);

  // State values for tracking sliding and picker position
  const isSliding = useValue(false);
  const pickerX = useValue(0);
  const pickerY = useValue(0);

  // Gesture handler for handling slider interactions
  const gestureHandler = useGestureHandler<{
    x: number;
  }>({
    onStart: ({ x }) => {
      pickerX.current = x;
      // This property is used in the usePickerLayout hook
      // to move the picker circle up and down
      isSliding.current = true;
    },
    onActive: ({ x }) => {
      pickerX.current = x;
    },
    onEnd: () => {
      isSliding.current = false;
    },
  });

  // Custom hook for layout calculations
  const { clampedPickerX } = usePickerLayout({
    isSliding,
    pickerX,
    pickerY,
    radius: metaballRadius,
    sliderSize: size,
  });

  // Font size for the picker circle text
  const fontSize = 15;

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
  const pickerCircleText = useComputedValue(() => {
    return Math.round(
      interpolate(
        clampedPickerX.current,
        // Input range: radius -> width - radius (Since the picker circle can't go outside the slider)
        [metaballRadius.current, size.width - metaballRadius.current],
        // 0 is the min value of the slider
        // 100 is the max value of the slider
        [0, 100],
        Extrapolate.CLAMP,
      ),
    ).toString();
  }, [clampedPickerX, metaballRadius, size]);

  // Computed value for the X position of the picker text
  const pickerTextX = useComputedValue(() => {
    if (!font) return 0;
    // That's the trick for centering the text inside the picker circle
    return (
      clampedPickerX.current - font.getTextWidth(pickerCircleText.current) / 2
    );
  }, [clampedPickerX, pickerCircleTextContainerRadius, font, pickerCircleText]);

  // Rendering the FluidSlider component
  return (
    <Touchable.Canvas
      style={{
        ...size,
      }}>
      <Group layer={layer}>
        <Touchable.RoundedRect
          x={0}
          y={Selector(
            metaballRadius,
            val => val * 2 + DISTANCE_BETWEEN_SLIDER_AND_METABALL,
          )}
          width={size.width}
          height={sliderHeight}
          r={5}
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
          y={Selector(pickerY, val => val + fontSize / 3)}
          text={pickerCircleText}
          font={font}
        />
      )}
    </Touchable.Canvas>
  );
};

// Exporting the FluidSlider component
export { FluidSlider };

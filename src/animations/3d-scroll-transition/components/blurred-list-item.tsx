import {
  Blur,
  BlurMask,
  Canvas,
  Fill,
  Group,
  Mask,
  Paint,
  SweepGradient,
  Text,
  useFont,
  vec,
} from '@shopify/react-native-skia';
import { FC, useMemo } from 'react';
import { useWindowDimensions } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

// Import the custom font
// TODO: Improve
// eslint-disable-next-line @typescript-eslint/no-var-requires
const SFProRoundedBold = require('../../../../assets/fonts/SF-Pro-Rounded-Bold.otf');

// Define the BlurredListItem functional component
export const BlurredListItem: FC<{
  text: string;
  size: number;
  index: number;
  scrollY: SharedValue<number>;
}> = ({ text, size, index, scrollY }) => {
  // Calculate input range based on size and index
  const inputRange = useMemo(
    () => [
      size * (index - 1),
      size * (index - 1) + 20,
      size * index,
      size * (index + 1) - 20,
      size * (index + 1),
    ],
    [index, size],
  );

  const blur = useDerivedValue(() => {
    // The trick of this output range is to make the blur effect equal to 0 when the item is in the center
    // but the important thing is to reset the blur effect to 0 when the item is not in the center
    // this will improve the performance because the blur effect is very expensive
    const outputRange = [0, 6, 0, 6, 0];
    return interpolate(
      scrollY.value,
      inputRange,
      outputRange,
      Extrapolation.CLAMP,
    );
  }, [inputRange, scrollY]);

  const opacity = useDerivedValue(() => {
    const outputRange = [0, 0.5, 1, 0.5, 0];
    return interpolate(
      scrollY.value,
      inputRange,
      outputRange,
      Extrapolation.CLAMP,
    );
  }, [inputRange, scrollY]);

  const rItemStyle = useAnimatedStyle(() => {
    const rotateX = interpolate(scrollY.value, inputRange, [
      -Math.PI / 2,
      -Math.PI / 2,
      0,
      -Math.PI / 2,
      -Math.PI / 2,
    ]);
    return {
      opacity: opacity.value,
      transform: [
        {
          perspective: 200,
        },
        {
          rotateX: `${rotateX}rad`,
        },
      ],
    };
  }, [inputRange, scrollY]);

  const { width: windowWidth } = useWindowDimensions();
  const font = useFont(SFProRoundedBold, 175);
  const sweepGradient = useMemo(() => {
    return (
      <SweepGradient
        c={vec(windowWidth / 2, size / 2)}
        colors={['cyan', 'magenta', 'yellow', 'cyan']}
      />
    );
  }, [size, windowWidth]);

  if (!font) {
    return null;
  }
  return (
    <Animated.View style={rItemStyle}>
      <Canvas
        style={{
          width: windowWidth,
          height: size,
        }}>
        <Group
          layer={
            <Paint>
              <Blur blur={blur} />
            </Paint>
          }>
          <Mask
            mask={
              <Text
                color={'white'}
                font={font}
                text={text}
                x={windowWidth / 2 - font.measureText(text).width / 2}
                y={size / 2 + font.getSize() / 4}
              />
            }>
            <Fill>{sweepGradient}</Fill>
          </Mask>
          <BlurMask blur={4} style={'solid'} />
        </Group>
      </Canvas>
    </Animated.View>
  );
};

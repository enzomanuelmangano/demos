import { useLayoutEffect } from 'react';
import type { MeasuredDimensions } from 'react-native-reanimated';
import Animated, {
  interpolate,
  measure,
  runOnUI,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Dimensions } from 'react-native';

import { BouncyProgressShared } from '../../animations/bouncy';

type BouncyViewProps = {
  children: React.ReactNode;
};

const { width: WindowWidth, height: WindowHeight } = Dimensions.get('window');

/**
 * BouncyView component that applies scale animations to its children
 * The animation scales from center based on distance from screen center
 */
export const BouncyView = ({ children }: BouncyViewProps) => {
  const dimensions = useSharedValue<MeasuredDimensions | null>(null);

  const aRef = useAnimatedRef();

  // Measure component dimensions after layout
  useLayoutEffect(() => {
    runOnUI(() => {
      dimensions.value = measure(aRef);
    })();
  }, [aRef, dimensions]);

  const mainDiagonal = Math.sqrt(
    WindowWidth * WindowWidth + WindowHeight * WindowHeight,
  );

  const rStyle = useAnimatedStyle(() => {
    if (!dimensions.value) {
      return {};
    }

    const elementCenterX = dimensions.value.pageX + dimensions.value.width / 2;
    const elementCenterY = dimensions.value.pageY + dimensions.value.height / 2;
    const translateX = WindowWidth / 2 - elementCenterX;
    const translateY = WindowHeight / 2 - elementCenterY;

    const distance = Math.sqrt(
      translateX * translateX + translateY * translateY,
    );

    const secondExpectedScale = interpolate(
      distance,
      [0, mainDiagonal / 2],
      [1, 0],
    );

    const scale = interpolate(
      BouncyProgressShared.value,
      [0, 1, 2],
      [12, secondExpectedScale, 1],
    );

    return {
      transform: [
        {
          translateX: translateX,
        },
        {
          translateY: translateY,
        },
        {
          scale: scale,
        },
        {
          translateX: -translateX,
        },
        {
          translateY: -translateY,
        },
      ],
    };
  });

  return (
    <Animated.View ref={aRef} style={rStyle}>
      {children}
    </Animated.View>
  );
};

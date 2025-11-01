import { Dimensions, useWindowDimensions } from 'react-native';

import { useMemo } from 'react';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';

export type CardProps = {
  index: number;
  color: string;
  scrollOffset: SharedValue<number>;
};

export interface CardData {
  color: string;
}

// Static dimensions for initial render (will be replaced with responsive hook in components)
const { width: INITIAL_WINDOW_WIDTH } = Dimensions.get('window');
export const CARD_WIDTH = INITIAL_WINDOW_WIDTH / 3;
export const CARD_HEIGHT = (CARD_WIDTH / 3) * 4;

// Animation constants
const ANIMATION_CONFIG = {
  scale: {
    min: 0.75,
    medium: 0.8,
    active: 1,
  },
  rotation: {
    maxAngle: Math.PI / 5,
    mediumAngle: Math.PI / 10,
    smallAngle: Math.PI / 20,
  },
  translation: {
    xMultiplier: {
      small: 0.2,
      medium: 0.25,
      large: 0.3,
    },
    yMultiplier: {
      small: 0.02,
      medium: 0.025,
      large: 0.04,
      active: 0.05,
    },
    swapDivisor: 2.8,
  },
  perspective: {
    value: 10000000,
    rotationAngle: Math.PI / 10,
    swapAngle: Math.PI / 5,
  },
  zIndex: {
    min: 0,
    low: 200,
    medium: 300,
    high: 400,
  },
  shadow: {
    color: '#000',
    opacity: 0.08,
    radius: 10,
    offset: { width: 0, height: 5 },
    elevation: 5,
  },
  border: {
    radius: 20,
  },
};

export const useCardDimensions = () => {
  const { width: windowWidth } = useWindowDimensions();

  return useMemo(() => {
    const cardWidth = windowWidth / 3;
    const cardHeight = (cardWidth / 3) * 4;
    return { cardWidth, cardHeight };
  }, [windowWidth]);
};

// The trick behind this animation is a very aggressive interpolation of the scroll offset.
// We use a ScrollView to drive the animation, and we interpolate
// the scroll offset to create the card rotation.

// The goal is to interpolate:
// - the scale of the card
// - the rotation of the card
// - the translation of the card on the X axis
// - the translation of the card on the Y axis
// - the perspective rotation of the card
// - the additional translation of the card on the X axis (to create the swap effect)

export const Card: React.FC<CardProps> = ({ index, color, scrollOffset }) => {
  const { width: WindowWidth } = useWindowDimensions();

  // Usually the inputRange is just given by [(index-1)*CARD_WIDTH, index*CARD_WIDTH, (index+1)*CARD_WIDTH]
  // Why do we need to have this huge inputRange?
  // The point is that we want to have a lot of control over all the steps of the animation.
  const inputRange = [
    (index - 3) * CARD_WIDTH,
    (index - 2) * CARD_WIDTH,
    (index - 1) * CARD_WIDTH,
    index * CARD_WIDTH,
    (index + 1) * CARD_WIDTH,
    (index + 2) * CARD_WIDTH,
    (index + 3) * CARD_WIDTH,
  ];

  const rStyle = useAnimatedStyle(() => {
    const {
      scale: scaleConfig,
      rotation,
      translation,
      perspective,
    } = ANIMATION_CONFIG;

    const scale = interpolate(
      scrollOffset.value,
      inputRange,
      [
        scaleConfig.min,
        scaleConfig.medium,
        scaleConfig.medium,
        scaleConfig.active,
        scaleConfig.medium,
        scaleConfig.medium,
        scaleConfig.min,
      ],
      Extrapolation.CLAMP,
    );

    const rotate = interpolate(
      scrollOffset.value,
      inputRange,
      [
        -rotation.maxAngle,
        -rotation.mediumAngle,
        -rotation.smallAngle,
        0,
        rotation.smallAngle,
        rotation.mediumAngle,
        rotation.maxAngle,
      ],
      Extrapolation.CLAMP,
    );

    const translateX = interpolate(
      scrollOffset.value,
      inputRange,
      [
        -CARD_WIDTH * translation.xMultiplier.large,
        -CARD_WIDTH * translation.xMultiplier.medium,
        -CARD_WIDTH * translation.xMultiplier.small,
        0,
        CARD_WIDTH * translation.xMultiplier.small,
        CARD_WIDTH * translation.xMultiplier.medium,
        CARD_WIDTH * translation.xMultiplier.large,
      ],
      Extrapolation.CLAMP,
    );

    const translateY = interpolate(
      scrollOffset.value,
      inputRange,
      [
        -CARD_HEIGHT * translation.yMultiplier.active,
        -CARD_HEIGHT * translation.yMultiplier.medium,
        -CARD_HEIGHT * translation.yMultiplier.large,
        0,
        -CARD_HEIGHT * translation.yMultiplier.large,
        -CARD_HEIGHT * translation.yMultiplier.medium,
        -CARD_HEIGHT * translation.yMultiplier.small,
      ],
      Extrapolation.CLAMP,
    );

    const perspectiveRotateY = interpolate(
      scrollOffset.value,
      [
        (index - 3) * CARD_WIDTH,
        (index - 2) * CARD_WIDTH,
        (index - 1) * CARD_WIDTH,
        (index - 0.5) * CARD_WIDTH,
        index * CARD_WIDTH,
        (index + 0.5) * CARD_WIDTH,
        (index + 1) * CARD_WIDTH,
        (index + 2) * CARD_WIDTH,
        (index + 3) * CARD_WIDTH,
      ],
      [
        -perspective.rotationAngle,
        -perspective.rotationAngle,
        -rotation.smallAngle,
        -perspective.swapAngle,
        0,
        perspective.swapAngle,
        rotation.smallAngle,
        perspective.rotationAngle,
        perspective.rotationAngle,
      ],
      Extrapolation.CLAMP,
    );

    const additionalTranslateX = interpolate(
      scrollOffset.value,
      [
        (index - 3) * CARD_WIDTH,
        (index - 2) * CARD_WIDTH,
        (index - 1) * CARD_WIDTH,
        (index - 0.5) * CARD_WIDTH,
        index * CARD_WIDTH,
        (index + 0.5) * CARD_WIDTH,
        (index + 1) * CARD_WIDTH,
        (index + 2) * CARD_WIDTH,
        (index + 3) * CARD_WIDTH,
      ],
      [
        0,
        0,
        0,
        -CARD_WIDTH / translation.swapDivisor,
        0,
        CARD_WIDTH / translation.swapDivisor,
        0,
        0,
        0,
      ],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX },
        { translateY },
        { translateX: additionalTranslateX },
        { scale },
        { rotate: `${rotate}rad` },
        { rotateY: `${perspectiveRotateY}rad` },
      ],
    };
  });

  const zIndexStyle = useAnimatedStyle(() => {
    const { zIndex: zIndexConfig } = ANIMATION_CONFIG;

    const zIndex = interpolate(
      scrollOffset.value,
      [
        (index - 3) * CARD_WIDTH,
        (index - 2) * CARD_WIDTH,
        (index - 1) * CARD_WIDTH,
        index * CARD_WIDTH,
        (index + 1) * CARD_WIDTH,
        (index + 2) * CARD_WIDTH,
        (index + 3) * CARD_WIDTH,
      ],
      [
        zIndexConfig.min,
        zIndexConfig.low,
        zIndexConfig.medium,
        zIndexConfig.high,
        zIndexConfig.medium,
        zIndexConfig.low,
        zIndexConfig.min,
      ],
      Extrapolation.CLAMP,
    );

    return {
      transformOrigin: ['50%', '50%', zIndex],
      transform: [{ perspective: 10000000 }],
    };
  });

  const shadowStyle = useMemo(() => {
    const { shadow } = ANIMATION_CONFIG;

    return {
      boxShadow: `0px ${shadow.offset.height}px ${shadow.radius}px rgba(0, 0, 0, ${shadow.opacity})`,
    };
  }, []);

  return (
    <Animated.View
      style={zIndexStyle}
      accessible
      accessibilityRole="button"
      accessibilityLabel={`Card ${index + 1} with ${color} color`}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (WindowWidth - CARD_WIDTH) / 2,
            height: CARD_HEIGHT,
            width: CARD_WIDTH,
            borderRadius: ANIMATION_CONFIG.border.radius,
            borderCurve: 'continuous',
            backgroundColor: color,
          },
          shadowStyle,
          rStyle,
        ]}
      />
    </Animated.View>
  );
};

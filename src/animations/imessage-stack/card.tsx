import { Dimensions } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

type CardProps = {
  index: number;
  color: string;

  scrollOffset: SharedValue<number>;
};

const { width: WindowWidth } = Dimensions.get('window');

export const CARD_WIDTH = WindowWidth / 3;
export const CARD_HEIGHT = (CARD_WIDTH / 3) * 4;

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
    const scaleOutputRange = [0.75, 0.8, 0.8, 1, 0.8, 0.8, 0.75];
    const scale = interpolate(
      scrollOffset.value,
      inputRange,
      scaleOutputRange,
      Extrapolation.CLAMP,
    );

    const rotateOutputRange = [
      -Math.PI / 5,
      -Math.PI / 10,
      -Math.PI / 20,
      0,
      Math.PI / 20,
      Math.PI / 10,
      Math.PI / 5,
    ];
    const rotate = interpolate(
      scrollOffset.value,
      inputRange,
      rotateOutputRange,
      Extrapolation.CLAMP,
    );

    const translateXOutputRange = [
      -CARD_WIDTH * 0.3,
      -CARD_WIDTH * 0.25,
      -CARD_WIDTH * 0.2,
      0,
      CARD_WIDTH * 0.2,
      CARD_WIDTH * 0.25,
      CARD_WIDTH * 0.3,
    ];
    const translateX = interpolate(
      scrollOffset.value,
      inputRange,
      translateXOutputRange,
      Extrapolation.CLAMP,
    );

    const translateYOutputRange = [
      -CARD_HEIGHT * 0.05,
      -CARD_HEIGHT * 0.025,
      -CARD_HEIGHT * 0.04,
      0,
      -CARD_HEIGHT * 0.04,
      -CARD_HEIGHT * 0.025,
      -CARD_HEIGHT * 0.02,
    ];
    const translateY = interpolate(
      scrollOffset.value,
      inputRange,
      translateYOutputRange,
      Extrapolation.CLAMP,
    );

    const perspectiveRotateY = interpolate(
      scrollOffset.value, // The current scroll offset value
      [
        (index - 3) * CARD_WIDTH,
        (index - 2) * CARD_WIDTH,
        (index - 1) * CARD_WIDTH,
        (index - 0.5) * CARD_WIDTH, // Detailed control over the swap between cards
        index * CARD_WIDTH,
        (index + 0.5) * CARD_WIDTH, // Detailed control over the swap between cards
        (index + 1) * CARD_WIDTH,
        (index + 2) * CARD_WIDTH,
        (index + 3) * CARD_WIDTH,
      ],
      [
        -Math.PI / 10,
        -Math.PI / 10,
        -Math.PI / 20,
        -Math.PI / 5,
        0,
        Math.PI / 5,
        Math.PI / 20,
        Math.PI / 10,
        Math.PI / 10,
      ],
      Extrapolation.CLAMP,
    );

    const additionalTranslateX = interpolate(
      scrollOffset.value, // The current scroll offset value
      [
        (index - 3) * CARD_WIDTH,
        (index - 2) * CARD_WIDTH,
        (index - 1) * CARD_WIDTH,
        (index - 0.5) * CARD_WIDTH, // Detailed control over the swap between cards
        index * CARD_WIDTH,
        (index + 0.5) * CARD_WIDTH, // Detailed control over the swap between cards
        (index + 1) * CARD_WIDTH,
        (index + 2) * CARD_WIDTH,
        (index + 3) * CARD_WIDTH,
      ],
      // While swapping we push the card to the left or to the right to avoid the overlap
      // Try to replace -CARD_WIDTH / 2.8 with 0 and see what happens
      [0, 0, 0, -CARD_WIDTH / 2.8, 0, CARD_WIDTH / 2.8, 0, 0, 0],
      Extrapolation.CLAMP,
    );

    return {
      transform: [
        { translateX },
        { translateY },
        { translateX: additionalTranslateX },
        { scale },
        { rotate: `${rotate}rad` },
        {
          rotateY: `${perspectiveRotateY}rad`,
        },
      ],
    };
  }, []);

  const zIndexStyle = useAnimatedStyle(() => {
    const zIndexOutputRange = [0, 200, 300, 400, 300, 200, 0];

    const zIndex = interpolate(
      scrollOffset.value,
      inputRange,
      zIndexOutputRange,
      Extrapolation.CLAMP,
    );

    return {
      transformOrigin: ['50%', '50%', zIndex],
      transform: [{ perspective: 10000000 }],
    };
  });

  return (
    <Animated.View style={zIndexStyle}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: (WindowWidth - CARD_WIDTH) / 2,
            height: CARD_HEIGHT,
            width: CARD_WIDTH,
            borderRadius: 20,
            borderCurve: 'continuous',
            backgroundColor: color,
            shadowColor: 'rgba(0, 0, 0, 0.3)',
            shadowOffset: {
              width: 0,
              height: 10,
            },
            shadowOpacity: 0.2,
            shadowRadius: 20,
          },
          rStyle,
        ]}
      />
    </Animated.View>
  );
};

import { type FC } from 'react';
import { Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

import { CARD_HEIGHT, CARD_WIDTH } from '../utils/constants';
import type { CardProps } from '../utils/types';
import { CardCanvas } from './card-canvas.component';
import { CardChip } from './card-chip.component';
import { styles } from './card.styles';

export const Card: FC<CardProps> = ({ item, index, scrollX }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const input = [
      (index - 1) * CARD_WIDTH,
      index * CARD_WIDTH,
      (index + 1) * CARD_WIDTH,
    ];

    const rotate = interpolate(scrollX.value, input, [180, 0, -180], 'clamp');

    const fullInput = [
      (index - 1) * CARD_WIDTH,
      (index - 0.5) * CARD_WIDTH,
      index * CARD_WIDTH,
      (index + 0.5) * CARD_WIDTH,
      (index + 1) * CARD_WIDTH,
    ];
    const translateY = interpolate(
      scrollX.value,
      fullInput,
      [0, -6, 0, -6, 0],
      'clamp',
    );

    // Fade cards based on their position relative to the center
    const opacity = interpolate(scrollX.value, input, [0.5, 1, 0.5], 'clamp');

    return {
      transform: [
        { rotate: '18deg' }, // Base rotation for card tilt
        { perspective: 1200 }, // 3D perspective for realistic effect
        { translateY },
        { rotateY: `${rotate}deg` },
      ],
      opacity,
    };
  });

  /**
   * Chip animation style
   * Controls the opacity of the card chip based on scroll position
   */
  const chipAnimatedStyle = useAnimatedStyle(() => {
    const input = [
      (index - 1) * CARD_WIDTH,
      index * CARD_WIDTH,
      (index + 1) * CARD_WIDTH,
    ];

    const opacity = interpolate(scrollX.value, input, [0.2, 0.6, 0.2], 'clamp');

    return {
      opacity,
    };
  });

  const rTitleWrapper = useAnimatedStyle(() => {
    const input = [
      (index - 1) * CARD_WIDTH,
      index * CARD_WIDTH,
      (index + 1) * CARD_WIDTH,
    ];

    const opacity = interpolate(scrollX.value, input, [0, 1, 0], 'clamp');

    return {
      opacity: Math.round(opacity),
    };
  });

  const rotate = useDerivedValue(() => {
    const input = [
      (index - 1) * CARD_WIDTH,
      index * CARD_WIDTH,
      (index + 1) * CARD_WIDTH,
    ];

    return interpolate(scrollX.value, input, [-Math.PI, 0, Math.PI], 'clamp');
  });

  return (
    <View style={styles.cardContainer}>
      <Animated.View style={[{ flex: 1, padding: 16 }, animatedStyle]}>
        <View style={styles.card}>
          <CardCanvas
            rotation={rotate}
            cardType={item.id - 1}
            width={CARD_WIDTH}
            height={CARD_HEIGHT}
          />
          <View style={[styles.cardContent, { opacity: 0.7 }]}>
            <CardChip chipAnimatedStyle={chipAnimatedStyle} />
            <Animated.View style={[styles.titleWrapper, rTitleWrapper]}>
              <Text
                style={[
                  styles.cardTitle,
                  {
                    color: '#000',
                    textTransform: 'uppercase',
                  },
                ]}>
                {item.title}
              </Text>
            </Animated.View>
          </View>
        </View>
      </Animated.View>
    </View>
  );
};

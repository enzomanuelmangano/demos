import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { type FC, memo, useMemo } from 'react';

import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

import { CardBack } from './back';
import { CardFront } from './front';
import { spacing } from '../../constants';

import type { ProfileType } from './types';

const SPRING_CONFIG = {
  mass: 1.2,
  stiffness: 60,
  damping: 12,
  velocity: 0.2,
} as const;

type FlipCardProps = {
  /** Profile information */
  profile: ProfileType;
  /** Card orientation - can be 'horizontal', 'vertical', or a specific degree angle */
  angle?: `${number}deg` | 'horizontal' | 'vertical';
  /** Whether the card is flipped to show the back */
  isFlipped?: boolean;
};

export const FlipCard: FC<FlipCardProps> = memo(
  ({ isFlipped, profile, angle = 'horizontal' }) => {
    const { width: screenWidth } = useWindowDimensions();

    const cardDimensions = useMemo(() => {
      const cardWidth = screenWidth - spacing.xxl;
      const cardHeight = cardWidth / 1.6;
      return { cardWidth, cardHeight };
    }, [screenWidth]);

    const { cardWidth, cardHeight } = cardDimensions;

    const progress = useDerivedValue(() => {
      return withSpring(isFlipped ? 1 : 0, SPRING_CONFIG);
    }, [isFlipped]);
    const frontAnimatedStyle = useAnimatedStyle(() => {
      const rotateY = interpolate(progress.value, [0, 1], [0, 180]);
      const scale = interpolate(progress.value, [0, 0.5, 1], [1, 0.98, 1]);

      return {
        transform: [
          { perspective: 1000 },
          { rotateY: `${rotateY}deg` },
          { scale },
        ],
        backfaceVisibility: 'hidden',
      };
    }, [progress]);

    const backAnimatedStyle = useAnimatedStyle(() => {
      const rotateY = interpolate(progress.value, [0, 1], [180, 360]);
      const scale = interpolate(progress.value, [0, 0.5, 1], [1, 0.98, 1]);

      return {
        transform: [
          { perspective: 1000 },
          { rotateY: `${rotateY}deg` },
          { scale },
        ],
        backfaceVisibility: 'hidden',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      };
    }, [progress]);

    const containerAnimatedStyle = useAnimatedStyle(() => {
      const scale = interpolate(progress.value, [0, 0.5, 1], [1, 0.98, 1]);

      return {
        transform: [{ scale }],
      };
    }, [progress]);

    const transformStyle = useMemo(() => {
      if (angle === 'horizontal') {
        return {
          width: cardWidth,
          height: cardHeight,
          transform: [{ rotate: '0deg' }],
        };
      }
      if (angle === 'vertical') {
        return {
          width: cardHeight,
          height: cardWidth,
          transform: [{ rotate: '-90deg' }],
        };
      }
      return {
        width: cardWidth,
        height: cardHeight,
        transform: [{ rotate: angle }],
      };
    }, [angle, cardWidth, cardHeight]);

    const cardStyle = useMemo(
      () => [styles.card, { width: cardWidth }],
      [cardWidth],
    );

    return (
      <View style={styles.container}>
        <View style={[styles.rotationContainer, transformStyle]}>
          <Animated.View style={containerAnimatedStyle}>
            <View style={cardStyle}>
              <View style={styles.flipContainer}>
                <Animated.View style={[styles.cardFace, frontAnimatedStyle]}>
                  <CardFront profile={profile} />
                </Animated.View>
                <Animated.View style={[styles.cardFace, backAnimatedStyle]}>
                  <CardBack isFlipped={!isFlipped} profile={profile} />
                </Animated.View>
              </View>
            </View>
          </Animated.View>
        </View>
      </View>
    );
  },
  (prevProps, nextProps) => {
    return (
      prevProps.isFlipped === nextProps.isFlipped &&
      prevProps.angle === nextProps.angle &&
      prevProps.profile === nextProps.profile
    );
  },
);

const styles = StyleSheet.create({
  card: {
    aspectRatio: 1.6,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  cardFace: {
    borderRadius: spacing.l + 4,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  flipContainer: {
    height: '100%',
    width: '100%',
  },
  rotationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

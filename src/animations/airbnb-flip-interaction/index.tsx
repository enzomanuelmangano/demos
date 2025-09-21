import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  Keyframe,
  useAnimatedProps,
  useDerivedValue,
  withSpring,
} from 'react-native-reanimated';

import { spacing } from './constants';
import { FlipCard } from './flip-interaction';
import { MainPage } from './flip-interaction/components/card/pages/MainPage';
import { SecondPage } from './flip-interaction/components/card/pages/SecondPage';
import type { ProfileType } from './flip-interaction/components/card/types';

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

// Animation configuration
const ANIMATION = {
  translate: {
    initial: 5,
    middle: 2,
  },
  opacity: {
    initial: 0,
    middle: 0.45,
    final: 1,
  },
} as const;

// Quick spring-like animation for front description
const enteringFront = new Keyframe({
  0: {
    opacity: ANIMATION.opacity.initial,
    transform: [{ translateY: -ANIMATION.translate.initial }],
  },
  60: {
    opacity: ANIMATION.opacity.middle,
    transform: [{ translateY: -ANIMATION.translate.middle }],
  },
  100: {
    opacity: ANIMATION.opacity.final,
    transform: [{ translateY: 0 }],
  },
}).duration(400);

// Quick fade out for front description
const exitingFront = new Keyframe({
  0: {
    opacity: ANIMATION.opacity.final,
    transform: [{ translateY: 0 }],
  },
  30: {
    opacity: ANIMATION.opacity.middle,
    transform: [{ translateY: ANIMATION.translate.middle }],
  },
  100: {
    opacity: ANIMATION.opacity.initial,
    transform: [{ translateY: ANIMATION.translate.initial }],
  },
}).duration(250);

// Quick spring-like animation for back description
const enteringBack = new Keyframe({
  0: {
    opacity: ANIMATION.opacity.initial,
    transform: [{ translateY: ANIMATION.translate.initial }],
  },
  60: {
    opacity: ANIMATION.opacity.middle,
    transform: [{ translateY: ANIMATION.translate.middle }],
  },
  100: {
    opacity: ANIMATION.opacity.final,
    transform: [{ translateY: 0 }],
  },
}).duration(400);

// Quick fade out for back description
const exitingBack = new Keyframe({
  0: {
    opacity: ANIMATION.opacity.final,
    transform: [{ translateY: 0 }],
  },
  30: {
    opacity: ANIMATION.opacity.middle,
    transform: [{ translateY: -ANIMATION.translate.middle }],
  },
  100: {
    opacity: ANIMATION.opacity.initial,
    transform: [{ translateY: -ANIMATION.translate.initial }],
  },
}).duration(250);

const sampleProfile: ProfileType = {
  name: 'Reactiive',
  location: 'Italy',
  trips: 3,
  reviews: 1,
  yearsOnAirbnb: 4,
  birthDecade: 'Born in the 90s',
  languages: ['Speaks Italian'],
  isIdentityVerified: true,
  visitedPlaces: [
    {
      name: 'Venezia',
      country: 'Venice, Italy',
      code: 'IT',
      visitDate: 'August 2020',
    },
  ],
};

const App = () => {
  const [isFlipped, setIsFlipped] = useState(false);
  const insets = useSafeAreaInsets();

  const progress = useDerivedValue(() => {
    return withSpring(isFlipped ? 1 : 0, {
      mass: 1.2,
      stiffness: 80,
      damping: 12,
      velocity: 0.3,
    });
  }, [isFlipped]);

  const blurProps = useAnimatedProps(() => ({
    intensity: interpolate(
      progress.value,
      [0, 0.2, 0.5, 0.8, 1],
      [0, 10, 20, 10, 0],
    ),
  }));

  const toggleCard = () => {
    setIsFlipped(prev => !prev);
  };

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <StatusBar style="dark" />
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Main Card Section */}
        <View style={styles.cardSection}>
          <TouchableOpacity activeOpacity={0.8} onPress={toggleCard}>
            <FlipCard
              profile={sampleProfile}
              isFlipped={isFlipped}
              angle="horizontal"
            />
          </TouchableOpacity>
        </View>

        {/* Description Section */}
        <View style={styles.descriptionSection}>
          <AnimatedBlurView
            animatedProps={blurProps}
            tint="light"
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'rgba(255, 255, 255, 0.5)',
              zIndex: 1,
            }}
          />
          {isFlipped ? (
            <Animated.View
              entering={enteringFront}
              exiting={exitingFront}
              key="back"
              style={styles.descriptionContainer}>
              <SecondPage />
            </Animated.View>
          ) : (
            <Animated.View
              entering={enteringBack}
              exiting={exitingBack}
              key="front"
              style={styles.descriptionContainer}>
              <MainPage />
            </Animated.View>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  cardSection: {
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: spacing.xl,
    alignItems: 'center',
  },
  descriptionSection: {
    paddingHorizontal: spacing.xxl,
    paddingTop: 0,
    paddingBottom: 40,
  },
  descriptionContainer: {
    borderRadius: spacing.m,
    overflow: 'hidden',
  },
});

export { App as AirbnbFlipInteraction };

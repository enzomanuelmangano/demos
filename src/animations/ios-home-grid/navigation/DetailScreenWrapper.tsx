import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedReaction,
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  interpolate,
} from 'react-native-reanimated';

import { useCustomNavigation } from './expansion-provider';

export const DetailScreenWrapper = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { backTransition, transitionScale } = useCustomNavigation();
  const trigger = useSharedValue(false);
  const scale = transitionScale;

  const maxScale = 0.7;

  const gesture = Gesture.Pan()
    .onChange(event => {
      // Add friction by reducing scaling sensitivity and using exponential curve
      const translationY = Math.max(0, event.translationY);
      const frictionFactor = 0.3; // Reduce sensitivity
      const resistanceY = translationY * frictionFactor;

      // Calculate scale with exponential resistance for more friction
      const scaleValue = Math.max(
        maxScale,
        Math.min(1, 1 - Math.pow(resistanceY / 400, 1.2)),
      );
      scale.value = scaleValue;

      if (translationY > 300) {
        trigger.value = true;
      }
    })
    .onEnd(event => {
      // Add velocity-based friction - slower gestures are more likely to reset
      const shouldReset = !trigger.value || Math.abs(event.velocityY) < 300;

      if (shouldReset) {
        trigger.value = false;
        scale.value = withSpring(1, {
          mass: 0.3,
          stiffness: 46,
          damping: 2,
        });
      }
    });

  useAnimatedReaction(
    () => trigger.value,
    (current, previous) => {
      if (current && !previous) {
        backTransition();
      }
    },
  );

  const rStyle = useAnimatedStyle(() => {
    return {
      borderRadius: interpolate(scale.value, [1, 0.8], [50, 30]),
      overflow: 'hidden',
      borderCurve: 'continuous',
      transform: [{ scale: scale.value }],
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={styles.outerContainer}>
        <Animated.View style={[styles.container, rStyle]}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    shadowColor: 'black',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 30,
    elevation: 5,
    zIndex: 1000,
  },
  container: {
    flex: 1,
  },
});

export const withDetailScreenWrapper = <T extends object>(
  Component: React.ComponentType<T>,
) => {
  return (props: T) => (
    <DetailScreenWrapper>
      <Component {...props} />
    </DetailScreenWrapper>
  );
};

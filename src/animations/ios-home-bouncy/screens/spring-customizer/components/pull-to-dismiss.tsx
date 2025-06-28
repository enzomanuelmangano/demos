import React, { useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  withSpring,
  useAnimatedStyle,
  runOnJS,
  interpolate,
  Extrapolation,
  useAnimatedProps,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

import { startAnimation } from '../../../animations/bouncy';

interface PullToDismissGestureProps {
  onClose?: () => void;
  children: React.ReactNode;
}

const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export const PullToDismissGesture: React.FC<PullToDismissGestureProps> = ({
  onClose,
  children,
}) => {
  const translateY = useSharedValue(0);
  const hasTriggeredMainAnimation = useSharedValue(false);

  const triggerMainAnimation = useCallback(() => {
    if (!hasTriggeredMainAnimation.value) {
      startAnimation();
      hasTriggeredMainAnimation.set(true);
    }
  }, [hasTriggeredMainAnimation]);

  const handleClose = useCallback(() => {
    if (onClose) {
      onClose();
    }
  }, [onClose]);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      hasTriggeredMainAnimation.set(false);
    })
    .onUpdate(event => {
      // Only allow downward scroll to dismiss
      if (event.translationY > 0) {
        translateY.set(event.translationY);

        if (translateY.value > 120) {
          runOnJS(triggerMainAnimation)();
        }
      }
    })
    .onEnd(event => {
      // If pulled down enough or velocity is high, close modal
      if (translateY.get() > 80 || event.velocityY > 800) {
        runOnJS(handleClose)();
      } else {
        // Snap back
        translateY.set(
          withSpring(0, {
            mass: 0.4,
          }),
        );
      }
    });

  const containerStyle = useAnimatedStyle(() => {
    const progress = Math.min(translateY.get() / 150, 1);

    // Simple opacity fade based on pull distance
    const opacity = interpolate(progress, [0, 1], [1, 0], Extrapolation.CLAMP);

    return {
      opacity,
      transform: [{ translateY: translateY.get() }],
    };
  });

  const animatedBlur = useAnimatedProps(() => {
    return {
      intensity: interpolate(translateY.get(), [0, 150], [70, 0]),
    };
  });

  return (
    <View style={styles.container}>
      <AnimatedBlurView
        style={StyleSheet.absoluteFill}
        tint="extraLight"
        animatedProps={animatedBlur}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.container, containerStyle]}>
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

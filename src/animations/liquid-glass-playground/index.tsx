import { StyleSheet, View } from 'react-native';

import { Image } from 'expo-image';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, withSpring } from 'react-native-reanimated';

import { HAPTIC_CONFIG, handleProgressiveHaptics } from './haptics';
import { Overlay } from './overlay';

const image = {
  uri: 'https://images.unsplash.com/photo-1592330169142-b488cfd72b2b?q=80&w=2832&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D',
};

export function Playground() {
  const translateY = useSharedValue(0);
  const lastHapticPosition = useSharedValue(0);
  const hasReachedMaxIntensity = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .failOffsetX(10)
    .onUpdate(event => {
      // Apply friction to make dragging feel more natural
      const dampedTranslation =
        event.translationY * HAPTIC_CONFIG.DRAG_FRICTION;
      translateY.value = dampedTranslation;

      handleProgressiveHaptics(
        dampedTranslation,
        lastHapticPosition,
        hasReachedMaxIntensity,
      );
    })
    .onEnd(() => {
      // Reset haptic tracking
      lastHapticPosition.value = 0;
      hasReachedMaxIntensity.value = false;

      // Animate glass view back to original position
      translateY.value = withSpring(0, {
        duration: 600,
        dampingRatio: 1,
      });
    });

  return (
    <View style={styles.container}>
      <GestureDetector gesture={panGesture}>
        <Animated.View
          style={[
            styles.glassView,
            {
              transform: [{ translateY }],
            },
          ]}>
          <Overlay style={styles.glassView} />
        </Animated.View>
      </GestureDetector>
      <Image source={image} contentFit="cover" style={styles.backgroundImage} />
    </View>
  );
}

const styles = StyleSheet.create({
  backgroundImage: {
    height: '100%',
    width: '100%',
  },
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  glassView: {
    ...StyleSheet.absoluteFill,
    borderCurve: 'continuous',
    borderRadius: 50,
    height: '100%',
    overflow: 'hidden',
    width: '100%',
    zIndex: 2,
  },
});

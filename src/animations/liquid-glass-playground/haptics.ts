import { Dimensions } from 'react-native';

import * as Haptics from 'expo-haptics';
import { Easing, SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export const HAPTIC_CONFIG = {
  DISTANCE_THRESHOLD: 5,
  MAX_DRAG_DISTANCE: Dimensions.get('window').height * 0.3,
  INTENSITY: {
    HEAVY: 1.0,
    MEDIUM: 0.7,
    LIGHT: 0.3,
  },
  DRAG_FRICTION: 0.5,
} as const;

// Inspired by https://github.com/EvanBacon/arc-browser-pull-to-refresh-haptics-in-Expo/blob/main/src/ArcScrollView.ios.tsx
export const triggerHapticFeedback = (intensity: number) => {
  if (intensity >= HAPTIC_CONFIG.INTENSITY.HEAVY) {
    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
  if (intensity >= HAPTIC_CONFIG.INTENSITY.MEDIUM) {
    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }
  if (intensity >= HAPTIC_CONFIG.INTENSITY.LIGHT) {
    return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  return Haptics.selectionAsync();
};

export function handleProgressiveHaptics(
  translation: number,
  lastPosition: SharedValue<number>,
  hasReachedMax: SharedValue<boolean>,
) {
  'worklet';

  const dragDistance = Math.abs(translation);
  const distanceSinceLastHaptic = Math.abs(dragDistance - lastPosition.value);

  // Only trigger haptic if we've moved enough distance
  if (distanceSinceLastHaptic < HAPTIC_CONFIG.DISTANCE_THRESHOLD) {
    return;
  }

  // Calculate normalized progress (0 to 1) with easing
  const rawProgress = dragDistance / HAPTIC_CONFIG.MAX_DRAG_DISTANCE;
  const clampedProgress = Math.min(rawProgress, 1.0);
  const easedProgress = Easing.ease(clampedProgress);

  // Check if we've reached maximum intensity
  const isAtMaxIntensity = easedProgress >= 1;

  // Prevent haptic spam when at max intensity
  if (hasReachedMax.value && isAtMaxIntensity) {
    return;
  }

  // Update max intensity state
  if (isAtMaxIntensity) {
    hasReachedMax.value = true;
  } else if (hasReachedMax.value && easedProgress < 1) {
    hasReachedMax.value = false;
  }

  // Trigger haptic feedback
  scheduleOnRN(triggerHapticFeedback, easedProgress);

  // Update last position for next comparison
  lastPosition.value = dragDistance;
}

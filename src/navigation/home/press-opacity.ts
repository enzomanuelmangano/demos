import { useCallback } from 'react';

import { Easing, useSharedValue, withTiming } from 'react-native-reanimated';

/** How far a pressed icon dims: a touch acknowledged, barely. */
export const PRESSED_OPACITY = 0.85;

/** Quick in, soft out: the press lands at once, the release eases back. */
const PRESS_IN = { duration: 80, easing: Easing.out(Easing.quad) };
const PRESS_OUT = { duration: 220, easing: Easing.out(Easing.quad) };

/**
 * A press acknowledged by a delicate dim, like a PressableOpacity: the
 * icon's artwork fades a touch while the finger is down. Not a scale: the
 * launch measures the icon on the tap, and a press that changes its size
 * starts the flight off its frame.
 *
 * Only this shared value is read by the style, so an idle cell runs nothing
 * per frame.
 */
export const usePressOpacity = () => {
  const opacity = useSharedValue(1);
  const onPressIn = useCallback(() => {
    opacity.set(withTiming(PRESSED_OPACITY, PRESS_IN));
  }, [opacity]);
  const onPressOut = useCallback(() => {
    opacity.set(withTiming(1, PRESS_OUT));
  }, [opacity]);
  return { opacity, onPressIn, onPressOut };
};

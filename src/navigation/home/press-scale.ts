import { useCallback } from 'react';

import { useSharedValue, withSpring } from 'react-native-reanimated';

/** Quick in, soft out: the press lands on the first frame, the release eases. */
const PRESS_IN = { damping: 30, stiffness: 900, mass: 1 };
const PRESS_OUT = { damping: 18, stiffness: 320, mass: 1 };

/**
 * A press acknowledged by scale, like a PressableScale: shrink while the
 * finger is down, spring back on release. Returns the scale for an animated
 * style and the handlers for a Pressable.
 *
 * Only this shared value is read by the style, so an idle cell runs nothing
 * per frame.
 */
export const usePressScale = (pressedScale: number) => {
  const scale = useSharedValue(1);
  const onPressIn = useCallback(() => {
    scale.set(withSpring(pressedScale, PRESS_IN));
  }, [scale, pressedScale]);
  const onPressOut = useCallback(() => {
    scale.set(withSpring(1, PRESS_OUT));
  }, [scale]);
  return { scale, onPressIn, onPressOut };
};

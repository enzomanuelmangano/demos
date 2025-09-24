import { useContext } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { InternalStackedModalContext, StackedModalContext } from '../context';

// The Backdrop component creates a visually appealing background for stacked modals.
// It uses a combination of a masked view, linear gradient, and blur effect to create
// a semi-transparent, animated backdrop that adjusts based on the number of modals.
// The backdrop animates from the bottom of the screen, creating a smooth transition
// as modals are added or removed.
export const Backdrop = () => {
  const { stackedModals } = useContext(InternalStackedModalContext);
  const { clearAllStackedModals } = useContext(StackedModalContext);
  const { height: windowHeight } = useWindowDimensions();

  const rAnimatedStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: '#0000006f',
      opacity: withTiming(stackedModals.length > 0 ? 1 : 0),
      pointerEvents: stackedModals.length > 0 ? 'auto' : 'none',
    };
  }, [windowHeight, stackedModals.length]);

  return (
    <Animated.View
      onTouchEnd={() => {
        clearAllStackedModals();
      }}
      style={[StyleSheet.absoluteFill, rAnimatedStyle]}
    />
  );
};

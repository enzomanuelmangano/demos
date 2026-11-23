import { StyleSheet } from 'react-native';

import React, { use } from 'react';

import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { RetrayContext } from '../../context';
import { useRetrayTheme } from '../../providers/theme';

// Animation constant
const BACKDROP_DURATION = 250;

const Backdrop: React.FC = React.memo(() => {
  const { state, actions } = use(RetrayContext);
  const theme = useRetrayTheme();

  const rBackdropStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(state.isActive.get() ? 1 : 0, {
        duration: BACKDROP_DURATION,
      }),
      pointerEvents: state.isActive.get() ? 'auto' : 'none',
    };
  }, [state.isActive]);

  return (
    <Animated.View
      onTouchStart={actions.dismiss}
      style={[
        {
          ...StyleSheet.absoluteFill,
          backgroundColor: theme.colors.overlay,
        },
        rBackdropStyle,
      ]}
    />
  );
});

export { Backdrop };

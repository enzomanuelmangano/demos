import { StyleSheet, useWindowDimensions } from 'react-native';

import { useContext } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { InternalStackedToastContext } from '../context';
import { useGradientHeight } from './use-gradient-height';

export const Backdrop = () => {
  const { stackedToasts } = useContext(InternalStackedToastContext);
  const { height: windowHeight } = useWindowDimensions();
  const gradientHeight = useGradientHeight();

  const rAnimatedStyle = useAnimatedStyle(() => {
    const top = windowHeight - gradientHeight;
    return {
      top: 0,
      transform: [
        {
          translateY: withSpring(top, {
            dampingRatio: 1,
            duration: 500,
          }),
        },
      ],
    };
  }, [windowHeight, stackedToasts.length]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, rAnimatedStyle]}>
      <LinearGradient
        locations={[0, 0.55]}
        colors={['rgba(255, 255,255,0.0)', 'rgba(255, 255,255,0.5)']}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  );
};

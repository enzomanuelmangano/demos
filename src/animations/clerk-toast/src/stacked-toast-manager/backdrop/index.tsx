import { StyleSheet, useWindowDimensions } from 'react-native';
import React, { useContext } from 'react';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { InternalStackedToastContext } from '../context';

import { useGradientHeight } from './use-gradient-height';

// The Backdrop component creates a visually appealing background for stacked toasts.
// It uses a combination of a masked view, linear gradient, and blur effect to create
// a semi-transparent, animated backdrop that adjusts based on the number of toasts.
// The backdrop animates from the bottom of the screen, creating a smooth transition
// as toasts are added or removed.
export const Backdrop = () => {
  const { stackedToasts } = useContext(InternalStackedToastContext);
  const { height: windowHeight } = useWindowDimensions();
  const gradientHeight = useGradientHeight();

  const rAnimatedStyle = useAnimatedStyle(() => {
    const top = windowHeight - gradientHeight;
    return {
      top: withTiming(top, {
        duration: 500,
      }),
    };
  }, [windowHeight, stackedToasts.length]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, rAnimatedStyle]}>
      <MaskedView
        pointerEvents="none"
        maskElement={
          <LinearGradient
            locations={[0, 0.55]}
            colors={['rgba(255, 255,255,0.0)', 'rgba(255, 255,255,1)']}
            style={StyleSheet.absoluteFill}
          />
        }
        style={{
          height: windowHeight / 2,
          width: '100%',
        }}>
        <BlurView
          intensity={80}
          tint={'systemChromeMaterialLight'}
          style={StyleSheet.absoluteFill}
        />
      </MaskedView>
    </Animated.View>
  );
};

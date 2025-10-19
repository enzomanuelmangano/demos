import { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useEffect } from 'react';
import { Keyboard, Platform } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { useRetrayTheme } from '../providers';

export const useKeyboardOffset = () => {
  const translateY = useSharedValue(0);
  const theme = useRetrayTheme();

  useEffect(() => {
    const showListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (e: any) => {
        translateY.value = withTiming(
          -e.endCoordinates.height + theme.spacing.md,
          {
            duration: Platform.OS === 'ios' ? 250 : 100,
          }
        );
      }
    );

    const hideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        translateY.value = withTiming(0, {
          duration: Platform.OS === 'ios' ? 250 : 100,
        });
      }
    );

    return () => {
      showListener.remove();
      hideListener.remove();
    };
  }, [translateY, theme.spacing.md]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return {
    animatedStyle,
    translateY,
  };
};

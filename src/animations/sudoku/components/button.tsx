import React, { useCallback } from 'react';
import type { ViewStyle, TextStyle } from 'react-native';
import { StyleSheet, Text, Platform, Pressable } from 'react-native';
import type { AnimateProps } from 'react-native-reanimated';
import Animated, {
  FadeIn,
  FadeOut,
  withSpring,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
} from 'react-native-reanimated';

import { COLORS } from '../theme';

type ButtonProps = {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  textStyle?: TextStyle;
  entering?: AnimateProps<ViewStyle>['entering'];
  exiting?: AnimateProps<ViewStyle>['exiting'];
  disabled?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Button: React.FC<ButtonProps> = ({
  onPress,
  title,
  variant = 'primary',
  size = 'medium',
  style,
  textStyle,
  entering,
  exiting,
  disabled = false,
}) => {
  const pressed = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(pressed.value, [0, 1], [1, 0.97]);
    const translateY = interpolate(pressed.value, [0, 1], [0, 1]);

    return {
      transform: [{ scale }, { translateY }],
    };
  });

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: interpolate(pressed.value, [0, 1], [0, 0.1]),
  }));

  const handlePressIn = useCallback(() => {
    if (disabled) return;

    pressed.value = withSpring(1, {
      mass: 0.2,
      damping: 12,
      stiffness: 120,
    });
  }, [disabled, pressed]);

  const handlePressOut = useCallback(() => {
    if (disabled) return;

    pressed.value = withSpring(0, {
      mass: 0.2,
      damping: 12,
      stiffness: 120,
    });
  }, [disabled, pressed]);

  const handlePress = useCallback(() => {
    if (disabled) return;

    onPress();
  }, [disabled, onPress]);

  const isPrimary = variant === 'primary';

  return (
    <Animated.View
      style={[
        styles.container,
        isPrimary && styles.primaryContainer,
        animatedStyle,
        style,
      ]}>
      <AnimatedPressable
        entering={entering || FadeIn.duration(400)}
        exiting={exiting || FadeOut.duration(200)}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[
          styles.button,
          styles[size],
          isPrimary ? styles.primary : styles.secondary,
          disabled && styles.disabled,
        ]}>
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: '#000' },
            overlayStyle,
          ]}
        />
        <Text
          style={[
            styles.text,
            { fontSize: SIZE_MAP[size] },
            !isPrimary && styles.secondaryText,
            disabled && styles.disabledText,
            textStyle,
          ]}>
          {title}
        </Text>
      </AnimatedPressable>
    </Animated.View>
  );
};

const SIZE_MAP = {
  small: 14,
  medium: 15,
  large: 16,
} as const;

const styles = StyleSheet.create({
  container: {
    borderRadius: 10,
    overflow: 'hidden',
    alignSelf: 'flex-start',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  primaryContainer: {
    backgroundColor: COLORS.primary + '08', // 3% opacity
  },
  button: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexDirection: 'row',
    gap: 8,
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: COLORS.border + '40', // 25% opacity
  },
  // eslint-disable-next-line react-native/no-unused-styles
  small: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 64,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  medium: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minWidth: 80,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  large: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    minWidth: 96,
  },
  text: {
    color: COLORS.text,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  secondaryText: {
    color: COLORS.textSecondary,
  },
  disabled: {
    opacity: 0.4,
    backgroundColor: COLORS.surface + '80',
  },
  disabledText: {
    color: COLORS.textTertiary,
  },
});

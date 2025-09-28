import { Platform, Pressable, StyleSheet, Text } from 'react-native';

import { type FC, useCallback } from 'react';

import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { COLORS } from '../theme';

import type { TextStyle, ViewStyle } from 'react-native';
import type { AnimatedProps } from 'react-native-reanimated';

type ButtonProps = {
  onPress: () => void;
  title: string;
  variant?: 'primary' | 'secondary';
  size?: 'small' | 'medium' | 'large';
  style?: ViewStyle;
  textStyle?: TextStyle;
  entering?: AnimatedProps<ViewStyle>['entering'];
  exiting?: AnimatedProps<ViewStyle>['exiting'];
  disabled?: boolean;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const Button: FC<ButtonProps> = ({
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
    alignSelf: 'flex-start',
    borderRadius: 10,
    overflow: 'hidden',
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
    alignItems: 'center',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: COLORS.border + '40',
    borderWidth: 1, // 25% opacity
  },
  // eslint-disable-next-line react-native/no-unused-styles
  small: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  medium: {
    minWidth: 80,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  large: {
    minWidth: 96,
    paddingHorizontal: 20,
    paddingVertical: 10,
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
    backgroundColor: COLORS.surface + '80',
    opacity: 0.4,
  },
  disabledText: {
    color: COLORS.textTertiary,
  },
});

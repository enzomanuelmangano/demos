import { Platform, StyleSheet, Text } from 'react-native';

import { type FC } from 'react';

import { PressableScale } from 'pressto';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';

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
  const isPrimary = variant === 'primary';

  return (
    <Animated.View
      style={[styles.container, isPrimary && styles.primaryContainer, style]}>
      <PressableScale
        entering={entering || FadeIn.duration(400)}
        exiting={exiting || FadeOut.duration(200)}
        onPress={onPress}
        enabled={!disabled}
        style={[
          styles.button,
          styles[size],
          isPrimary ? styles.primary : styles.secondary,
          disabled && styles.disabled,
        ]}>
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
      </PressableScale>
    </Animated.View>
  );
};

const SIZE_MAP = {
  small: 14,
  medium: 15,
  large: 16,
} as const;

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  container: {
    alignSelf: 'flex-start',
    borderCurve: 'continuous',
    borderRadius: 10,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        boxShadow: '0px 2px 6px rgba(0, 0, 0, 0.08)',
      },
      android: {
        elevation: 2,
      },
    }),
  },
  disabled: {
    backgroundColor: COLORS.surface + '80',
    opacity: 0.4,
  },
  disabledText: {
    color: COLORS.textTertiary,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  large: {
    minWidth: 96,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  medium: {
    minWidth: 80,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  primary: {
    backgroundColor: COLORS.primary,
  },
  primaryContainer: {
    backgroundColor: COLORS.primary + '08',
  },
  secondary: {
    backgroundColor: 'transparent',
    borderColor: COLORS.border + '40',
    borderWidth: 1,
  },
  secondaryText: {
    color: COLORS.textSecondary,
  },
  // eslint-disable-next-line react-native/no-unused-styles
  small: {
    minWidth: 64,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    color: COLORS.text,
    fontWeight: '500',
    letterSpacing: 0.2,
  },
});

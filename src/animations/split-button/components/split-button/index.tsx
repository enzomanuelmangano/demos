import { StyleSheet, Text, View } from 'react-native';

import { type FC, type ReactNode, memo, useState } from 'react';

import { PressableScale } from 'pressto';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '../../constants';

import type { StyleProp, ViewStyle } from 'react-native';

// Configuration for timing animations
const WithTimingConfig = {
  duration: 300,
};

type SplitButtonProps = {
  style?: StyleProp<ViewStyle>;
  onLeft?: () => void;
  onRight?: () => void;
  leftIcon: ReactNode;
  rightIcon: ReactNode;
  label?: string;
  buttonWidth?: number;
  maxSpacing?: number;
};

const SplitButton: FC<SplitButtonProps> = memo(
  ({
    style,
    onLeft,
    onRight,
    buttonWidth = 120,
    maxSpacing = 13,
    leftIcon,
    rightIcon,
    label = 'Start',
  }) => {
    // State to track the activation state of the button
    const [activated, setActive] = useState(false);

    // Calculate the offset for animation based on button width and spacing
    const offset = buttonWidth / 2 + maxSpacing;

    // Animated styles for the left button's movement
    const rRightStyle = useAnimatedStyle(() => {
      return {
        transform: [
          {
            translateX: withSpring(!activated ? 0 : offset),
          },
        ],
      };
    }, [activated]);

    // Animated styles for the right button's movement and opacity
    const rLeftStyle = useAnimatedStyle(() => {
      return {
        opacity: withTiming(activated ? 1 : 0, WithTimingConfig),
        transform: [
          {
            translateX: withSpring(!activated ? 0 : -offset),
          },
        ],
      };
    }, [activated]);

    // Animated styles for the chip's horizontal padding
    const rAnimatedChipStyle = useAnimatedStyle(() => {
      return {
        paddingHorizontal: withSpring(!activated ? 24 : 36, WithTimingConfig),
      };
    }, [activated]);

    return (
      <View style={[styles.container, style]}>
        {/* Left Button */}
        <Animated.View style={rLeftStyle}>
          <PressableScale
            onPress={() => {
              onLeft?.(); // Call the provided onLeft function if available
              setActive(false); // Deactivate the button
            }}>
            <View style={[styles.chip, activated && styles.activeChip]}>
              {activated && (
                <Animated.View
                  entering={FadeIn}
                  exiting={FadeOut}
                  layout={LinearTransition}
                  style={[styles.chipContent, rAnimatedChipStyle]}>
                  {leftIcon}
                </Animated.View>
              )}
            </View>
          </PressableScale>
        </Animated.View>

        {/* Right Button */}
        <Animated.View style={[styles.rightChipContainer, rRightStyle]}>
          <PressableScale
            onPress={() => {
              if (!activated) {
                setActive(true); // Activate the button
                return;
              }
              setActive(false); // Deactivate the button
              onRight?.(); // Call the provided onRight function if available
            }}>
            <View
              style={[
                styles.chip,
                styles.rightChip,
                activated && styles.activeRightChip,
              ]}>
              <Animated.View style={[styles.chipContent, rAnimatedChipStyle]}>
                <Text
                  style={[styles.chipText, activated && styles.activeChipText]}>
                  {activated ? rightIcon : label}
                </Text>
              </Animated.View>
            </View>
          </PressableScale>
        </Animated.View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  activeChip: {
    borderColor: colors.border,
    borderWidth: 1,
    width: 120,
  },
  activeChipText: {
    color: colors.white,
  },
  activeRightChip: {
    backgroundColor: colors.black,
    boxShadow: '0px 0px 0px rgba(0, 0, 0, 0.3)',
  },
  chip: {
    borderColor: colors.border,
    borderCurve: 'continuous',
    borderRadius: 16,
    borderWidth: 1,
    boxShadow: '0px 1px 5px rgba(0, 0, 0, 0.1)',
    height: 60,
    width: 140,
  },
  chipContent: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  chipText: {
    fontSize: 20,
    fontWeight: '600',
  },
  container: {
    alignItems: 'center',
    height: 100,
    justifyContent: 'center',
    width: '100%',
  },
  rightChip: {
    backgroundColor: colors.background,
  },
  rightChipContainer: {
    position: 'absolute',
    zIndex: 100,
  },
});

export { SplitButton };

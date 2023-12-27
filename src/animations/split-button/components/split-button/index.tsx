import React, { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  Layout,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { PressableScale } from '../pressable-scale';
import { colors } from '../../constants';

// Configuration for timing animations
const WithTimingConfig = {
  duration: 300,
};

type SplitButtonProps = {
  style?: StyleProp<ViewStyle>;
  onLeft?: () => void;
  onRight?: () => void;
  leftIcon: React.ReactNode;
  rightIcon: React.ReactNode;
  label?: string;
  buttonWidth?: number;
  maxSpacing?: number;
};

const SplitButton: React.FC<SplitButtonProps> = React.memo(
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
        paddingHorizontal: withTiming(!activated ? 24 : 36, WithTimingConfig),
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
                  layout={Layout}
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
  container: {
    height: 100,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chip: {
    width: 140,
    height: 60,
    shadowRadius: 5,
    shadowOpacity: 0.1,
    shadowOffset: { height: 1, width: 0 },
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  activeChip: {
    width: 120, // Adjust as needed
    borderColor: colors.border,
    borderWidth: 1,
  },
  rightChipContainer: {
    position: 'absolute',
    zIndex: 100,
  },
  rightChip: {
    backgroundColor: colors.background,
  },
  activeRightChip: {
    shadowOpacity: 0.3,
    backgroundColor: colors.black,
  },
  chipContent: {
    flex: 1,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    fontSize: 20,
    fontWeight: '600',
  },
  activeChipText: {
    color: colors.white,
  },
});

export { SplitButton };

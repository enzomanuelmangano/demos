/**
 * Number Pad Component
 *
 * This component renders an interactive number pad for the Sudoku game,
 * allowing users to input numbers and clear cells. It includes animations
 * for button presses and highlighting of selected numbers.
 */

import React, { memo, useCallback, useMemo } from 'react';
import { StyleSheet, View, Pressable, Dimensions } from 'react-native';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useSharedValue,
  useDerivedValue,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';

import { COLORS } from '../theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Props for individual number pad buttons
 */
type NumberPadButtonProps = {
  value: number | 'backspace';
  onPress: (value: number | 'backspace') => void;
  highlightedNumber: Animated.SharedValue<number>;
};

/**
 * Individual button component for the number pad
 * Handles animations for press states and highlighting
 */
const NumberPadButton = memo<NumberPadButtonProps>(
  ({ value, onPress, highlightedNumber }) => {
    const scale = useSharedValue(1);

    const isHighlighted = useDerivedValue(() => {
      return typeof value === 'number' && value === highlightedNumber.value;
    }, [value, highlightedNumber]);

    const numpadAnimatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
        backgroundColor: isHighlighted.value
          ? COLORS.highlightStrong
          : 'transparent',
        borderColor: isHighlighted.value ? COLORS.primary : COLORS.border,
      };
    }, [isHighlighted, scale]);

    const rHighlightedStyle = useAnimatedStyle(() => {
      return {
        color: isHighlighted.value ? COLORS.primaryLight : COLORS.userInput,
      };
    }, [isHighlighted]);

    const handlePressIn = useCallback(() => {
      scale.value = withSpring(0.95, { mass: 0.3 });
    }, [scale]);

    const handlePressOut = useCallback(() => {
      scale.value = withSpring(1, { mass: 0.3 });
    }, [scale]);

    const handlePress = useCallback(() => {
      onPress(value);
    }, [onPress, value]);

    return (
      <AnimatedPressable
        style={[styles.numpadButton, numpadAnimatedStyle]}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}>
        {value === 'backspace' ? (
          <Ionicons
            name="backspace-outline"
            size={22}
            color={COLORS.textSecondary}
          />
        ) : (
          <Animated.Text style={[styles.numpadButtonText, rHighlightedStyle]}>
            {value}
          </Animated.Text>
        )}
      </AnimatedPressable>
    );
  },
);

NumberPadButton.displayName = 'NumberPadButton';

/**
 * Props for the main NumberPad component
 */
type NumberPadProps = {
  onNumberPress: (number: number) => void;
  onBackspace: () => void;
  highlightedNumber: Animated.SharedValue<number>;
};

/**
 * Main NumberPad component that renders the grid of number buttons
 * and handles number input for the Sudoku game
 */
export const NumberPad = memo<NumberPadProps>(
  ({ onNumberPress, onBackspace, highlightedNumber }) => {
    const handlePress = useCallback(
      (value: number | 'backspace') => {
        if (value === 'backspace') {
          onBackspace();
        } else {
          onNumberPress(value);
        }
      },
      [onBackspace, onNumberPress],
    );

    const numberButtons = useMemo(() => {
      return [1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
        <NumberPadButton
          key={num}
          value={num}
          onPress={handlePress}
          highlightedNumber={highlightedNumber}
        />
      ));
    }, [handlePress, highlightedNumber]);

    return (
      <View style={styles.numpad}>
        {numberButtons}
        <NumberPadButton
          value="backspace"
          onPress={handlePress}
          highlightedNumber={highlightedNumber}
        />
      </View>
    );
  },
);

NumberPad.displayName = 'NumberPad';

// Calculate number pad dimensions based on screen width
const { width } = Dimensions.get('window');
const BOARD_SIZE = Math.min(width - 32, 400);

const styles = StyleSheet.create({
  numpad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 32,
    padding: 12,
    maxWidth: BOARD_SIZE,
  },
  numpadButton: {
    width: 46,
    height: 46,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  numpadButtonText: {
    fontSize: 18,
    fontWeight: '500',
    color: COLORS.userInput,
  },
});

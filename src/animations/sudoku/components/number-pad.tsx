/**
 * Number Pad Component
 *
 * This component renders an interactive number pad for the Sudoku game,
 * allowing users to input numbers and clear cells. It includes animations
 * for button presses and highlighting of selected numbers.
 */

import { Dimensions, Pressable, StyleSheet, View } from 'react-native';

import { memo, useCallback, useMemo } from 'react';

import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { COLORS } from '../theme';

import type { SharedValue } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * Props for individual number pad buttons
 */
type NumberPadButtonProps = {
  value: number | 'backspace';
  onPress: (value: number | 'backspace') => void;
  highlightedNumber: SharedValue<number>;
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
      scale.value = withSpring(0.95, {
        mass: 0.3,
        damping: 10,
        stiffness: 100,
      });
    }, [scale]);

    const handlePressOut = useCallback(() => {
      scale.value = withSpring(1, { mass: 0.3, damping: 10, stiffness: 100 });
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
  highlightedNumber: SharedValue<number>;
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
    gap: 10,
    justifyContent: 'center',
    marginTop: 32,
    maxWidth: BOARD_SIZE,
    padding: 12,
  },
  numpadButton: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderColor: COLORS.border,
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
    width: 46,
  },
  numpadButtonText: {
    color: COLORS.userInput,
    fontSize: 18,
    fontWeight: '500',
  },
});

/**
 * Individual cell component that renders a single Sudoku cell
 * with animations for highlighting and selection
 */

import { Pressable, StyleSheet, Text } from 'react-native';

import { memo, useMemo } from 'react';

import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { CELL_SIZE } from './constants';
import { COLORS } from '../../theme';

import type { CellValue } from '../../logic';
import type { SharedValue } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CellProps = {
  value: CellValue;
  highlightedNumber: SharedValue<number>;
  isBorderRight: boolean;
  isBorderBottom: boolean;
  isInitial: boolean;
  onPress: () => void;
  isSelected: SharedValue<boolean>;
};

export const Cell = memo<CellProps>(
  ({
    value,
    isSelected,
    highlightedNumber,
    isBorderRight,
    isBorderBottom,
    isInitial,
    onPress,
  }) => {
    const isHighlighted = useDerivedValue(() => {
      return value === highlightedNumber.value && highlightedNumber.value !== 0;
    }, [value, highlightedNumber]);

    const scale = useDerivedValue(() => {
      return withSpring(isHighlighted.value ? 1 : 0);
    }, [isHighlighted]);

    const cellAnimatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: scale.value }],
        opacity: withTiming(isHighlighted.value ? 1 : 0, {
          duration: 150,
        }),
        backgroundColor: withSpring(
          isHighlighted.value
            ? COLORS.highlightStrong
            : COLORS.highlightTransparent,
        ),
      };
    }, [isHighlighted, scale]);

    const rHighlightedStyle = useAnimatedStyle(() => {
      return {
        backgroundColor: isSelected.value ? COLORS.highlight : COLORS.surface,
      };
    }, [isSelected]);

    const cellStyle = useMemo(
      () => [
        styles.cell,
        isBorderRight && styles.borderRight,
        isBorderBottom && styles.borderBottom,
        rHighlightedStyle,
      ],
      [isBorderRight, isBorderBottom, rHighlightedStyle],
    );

    const textStyle = useMemo(
      () => [styles.cellText, isInitial && styles.initialCellText],
      [isInitial],
    );

    return (
      <AnimatedPressable style={cellStyle} onPress={onPress}>
        <Text style={textStyle}>{value || ''}</Text>
        <Animated.View style={[styles.cellBackground, cellAnimatedStyle]} />
      </AnimatedPressable>
    );
  },
);

const styles = StyleSheet.create({
  borderBottom: {
    borderBottomColor: COLORS.primary + '50',
    borderBottomWidth: 2,
  },
  borderRight: {
    borderRightColor: COLORS.primary + '50',
    borderRightWidth: 2,
  },
  cell: {
    alignItems: 'center',
    borderColor: COLORS.border,
    borderWidth: StyleSheet.hairlineWidth,
    height: CELL_SIZE,
    justifyContent: 'center',
    width: CELL_SIZE,
  },
  cellBackground: {
    borderCurve: 'continuous',
    borderRadius: 100,
    bottom: 0,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    zIndex: -1,
  },
  cellText: {
    color: COLORS.userInput,
    fontSize: 20,
    fontWeight: '600',
  },
  initialCellText: {
    color: COLORS.initial,
    fontWeight: '500',
  },
});

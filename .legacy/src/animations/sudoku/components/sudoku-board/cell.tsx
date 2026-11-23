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
import type { ViewProps } from 'react-native';
import type { AnimatedProps, SharedValue } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type CellProps = {
  rowIndex: number;
  colIndex: number;
  value: CellValue;
  selectedCell: SharedValue<{ row: number; col: number }>;
  highlightedNumber: SharedValue<number>;
  isBorderRight: boolean;
  isBorderBottom: boolean;
  isInitial: boolean;
  onPress: () => void;
  entering: AnimatedProps<ViewProps>['entering'];
};

export const Cell = memo<CellProps>(
  ({
    rowIndex,
    colIndex,
    value,
    selectedCell,
    highlightedNumber,
    isBorderRight,
    isBorderBottom,
    isInitial,
    onPress,
    entering,
  }) => {
    // A boolean derived value only notifies when it flips, so the style below
    // re-runs (and starts its animations) for the cells that change, not all 81.
    const isHighlighted = useDerivedValue(() => {
      return value === highlightedNumber.get() && highlightedNumber.get() !== 0;
    }, [value, highlightedNumber]);

    const cellAnimatedStyle = useAnimatedStyle(() => {
      return {
        transform: [{ scale: withSpring(isHighlighted.get() ? 1 : 0) }],
        opacity: withTiming(isHighlighted.get() ? 1 : 0, {
          duration: 150,
        }),
        backgroundColor: withSpring(
          isHighlighted.get()
            ? COLORS.highlightStrong
            : COLORS.highlightTransparent,
        ),
      };
    }, [isHighlighted]);

    // Unchanged styles are skipped by Reanimated, so computing the selection
    // here costs one comparison per cell instead of a derived value per cell.
    const rHighlightedStyle = useAnimatedStyle(() => {
      const selected =
        selectedCell.get().row === rowIndex &&
        selectedCell.get().col === colIndex &&
        highlightedNumber.get() === 0;
      return {
        backgroundColor: selected ? COLORS.highlight : COLORS.surface,
      };
    }, [rowIndex, colIndex, selectedCell, highlightedNumber]);

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
      <AnimatedPressable
        style={cellStyle}
        onPress={onPress}
        entering={entering}>
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
    borderWidth: 0.5,
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

/**
 * Individual cell component that renders a single Sudoku cell
 * with animations for highlighting and selection
 */

import React, { memo, useMemo } from 'react';
import { StyleSheet, Text, Pressable } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  useAnimatedStyle,
  withSpring,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { COLORS } from '../../theme';
import type { CellValue } from '../../logic';

import { CELL_SIZE } from './constants';

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
      return withSpring(isHighlighted.value ? 1 : 0, {
        mass: 0.5,
      });
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
          {
            mass: 0.5,
          },
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

Cell.displayName = 'Cell';

const styles = StyleSheet.create({
  cellBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 100,
    zIndex: -1,
    pointerEvents: 'none',
  },
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 0.5,
    borderColor: COLORS.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  borderRight: {
    borderRightWidth: 2,
    borderRightColor: COLORS.primary + '50',
  },
  borderBottom: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary + '50',
  },
  cellText: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.userInput,
  },
  initialCellText: {
    color: COLORS.initial,
    fontWeight: '500',
  },
});

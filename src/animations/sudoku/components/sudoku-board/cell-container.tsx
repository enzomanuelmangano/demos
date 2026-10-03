/**
 * Container component that manages the state and interactions for each cell
 */

import { memo, useCallback, useMemo } from 'react';

import { useDerivedValue } from 'react-native-reanimated';

import { Cell } from './cell';

import type { CellValue } from '../../logic';
import type { SharedValue } from 'react-native-reanimated';

export type CellContainerProps = {
  rowIndex: number;
  colIndex: number;
  value: CellValue;
  selectedCell: SharedValue<{ row: number; col: number }>;
  highlightedNumber: SharedValue<number>;
  isInitial: boolean;
  onCellPress: (row: number, col: number) => void;
};

export const CellContainer = memo<CellContainerProps>(
  ({
    rowIndex,
    colIndex,
    value,
    selectedCell,
    highlightedNumber,
    isInitial,
    onCellPress,
  }) => {
    const isSelected = useDerivedValue(() => {
      return (
        selectedCell.get().row === rowIndex &&
        selectedCell.get().col === colIndex &&
        highlightedNumber.get() === 0
      );
    }, [rowIndex, colIndex, selectedCell, highlightedNumber]);

    const handlePress = useCallback(() => {
      onCellPress(rowIndex, colIndex);
    }, [onCellPress, rowIndex, colIndex]);

    const isBorderRight = useMemo(
      () => (colIndex + 1) % 3 === 0 && colIndex !== 8,
      [colIndex],
    );

    const isBorderBottom = useMemo(
      () => (rowIndex + 1) % 3 === 0 && rowIndex !== 8,
      [rowIndex],
    );

    return (
      <Cell
        value={value}
        isSelected={isSelected}
        highlightedNumber={highlightedNumber}
        isBorderRight={isBorderRight}
        isBorderBottom={isBorderBottom}
        isInitial={isInitial}
        onPress={handlePress}
      />
    );
  },
);

CellContainer.displayName = 'CellContainer';

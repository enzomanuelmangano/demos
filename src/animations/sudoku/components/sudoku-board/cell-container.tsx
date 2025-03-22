/**
 * Container component that manages the state and interactions for each cell
 */

import React, { memo, useCallback, useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue } from 'react-native-reanimated';

import type { CellValue, SudokuBoard } from '../../logic';

import { Cell } from './cell';

export type CellContainerProps = {
  rowIndex: number;
  colIndex: number;
  value: CellValue;
  board: SudokuBoard;
  selectedCell: SharedValue<{ row: number; col: number }>;
  highlightedNumber: SharedValue<number>;
  initialBoard: SudokuBoard;
  onCellPress: (row: number, col: number) => void;
};

export const CellContainer = memo<CellContainerProps>(
  ({
    rowIndex,
    colIndex,
    value,
    board,
    selectedCell,
    highlightedNumber,
    initialBoard,
    onCellPress,
  }) => {
    const isSelected = useDerivedValue(() => {
      return (
        selectedCell.value.row === rowIndex &&
        selectedCell.value.col === colIndex &&
        board[rowIndex][colIndex] === value &&
        highlightedNumber.value === 0
      );
    }, [rowIndex, colIndex, value, board, selectedCell, highlightedNumber]);

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

    const isInitial = useMemo(
      () => initialBoard[rowIndex][colIndex] !== null,
      [initialBoard, rowIndex, colIndex],
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

/**
 * Container component that manages the state and interactions for each cell
 */

import { memo, useCallback, useMemo, useState } from 'react';

import { FadeIn } from 'react-native-reanimated';

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
  // performance.now() when the board started appearing
  revealStart: number;
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
    revealStart,
  }) => {
    // Rows are mounted one per frame (see SudokuBoard), so the time since the
    // reveal started comes off the delay: the cascade keeps its timing. Built
    // once, so re-renders don't hand the cell a new entering object.
    const [entering] = useState(() => {
      const elapsed = performance.now() - revealStart;
      return FadeIn.delay(
        Math.max(0, (rowIndex + colIndex) * 75 - elapsed),
      ).duration(350);
    });

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
        rowIndex={rowIndex}
        colIndex={colIndex}
        value={value}
        selectedCell={selectedCell}
        highlightedNumber={highlightedNumber}
        isBorderRight={isBorderRight}
        isBorderBottom={isBorderBottom}
        isInitial={isInitial}
        onPress={handlePress}
        entering={entering}
      />
    );
  },
);

CellContainer.displayName = 'CellContainer';

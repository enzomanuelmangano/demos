/**
 * Sudoku Board Component
 *
 * This component renders a fully interactive Sudoku game board with animations
 * and visual feedback. It handles cell selection, number input, and game state management.
 */

import { StyleSheet, View } from 'react-native';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useState,
} from 'react';

import Animated, { FadeInDown, useSharedValue } from 'react-native-reanimated';

import { SudokuGame } from '../../logic';
import { COLORS } from '../../theme';
import { NumberPad } from '../number-pad';
import { CellContainer } from './cell-container';
import { BOARD_SIZE, CELL_SIZE } from './constants';

import type { SudokuBoard as SudokuBoardType } from '../../logic';

export type SudokuBoardRef = {
  solve: () => boolean;
};

export type SudokuBoardProps = {
  initialBoard: SudokuBoardType;
  delay?: number;
  onComplete?: () => void;
};

/**
 * Main SudokuBoard component that manages the game state and renders the board
 */
export const SudokuBoard = forwardRef<SudokuBoardRef, SudokuBoardProps>(
  ({ initialBoard, delay = 0, onComplete }, ref) => {
    const [game] = useState(() => new SudokuGame(initialBoard));
    const [board, setBoard] = useState(() => game.getBoard());
    // The givens never change for a game: read them once instead of handing
    // every cell a fresh 9x9 copy per render (which defeated CellContainer's memo)
    const [givens] = useState(() => game.getInitialBoard());
    const selectedCell = useSharedValue(game.getSelectedCell());
    const highlightedNumber = useSharedValue(game.getHighlightedNumber());

    const solve = useCallback(() => {
      if (game.solve()) {
        setBoard(game.getBoard());
        onComplete?.();
        return true;
      }
      return false;
    }, [game, onComplete]);

    useImperativeHandle(ref, () => ({
      solve,
    }));

    const handleCellPress = useCallback(
      (row: number, col: number) => {
        game.selectCell(row, col);
        selectedCell.set(game.getSelectedCell());
        highlightedNumber.set(game.getHighlightedNumber());
      },
      [game, selectedCell, highlightedNumber],
    );

    const handleNumberPress = useCallback(
      (number: number) => {
        if (game.setNumber(number)) {
          setBoard(game.getBoard());
          if (game.isComplete()) {
            onComplete?.();
          }
        }
      },
      [game, onComplete],
    );

    const handleBackspace = useCallback(() => {
      if (game.clearCell()) {
        setBoard(game.getBoard());
      }
    }, [game]);

    // Rows mount one per frame instead of all 81 cells (each with its views,
    // pressable and mappers) in a single JS task, which stalled the reveal.
    const [mountedRows, setMountedRows] = useState(0);
    const [revealStart, setRevealStart] = useState(0);
    const [isNumberPadReady, setIsNumberPadReady] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => {
        setRevealStart(performance.now());
        setMountedRows(1);
      }, delay);
      const numberPadTimer = setTimeout(() => {
        setIsNumberPadReady(true);
      }, delay + 1600);

      return () => {
        clearTimeout(timer);
        clearTimeout(numberPadTimer);
      };
    }, [delay]);

    useEffect(() => {
      if (mountedRows === 0 || mountedRows >= board.length) return;
      const frame = requestAnimationFrame(() => {
        setMountedRows(rows => rows + 1);
      });
      return () => cancelAnimationFrame(frame);
    }, [mountedRows, board.length]);

    // Every row keeps its height while empty, so the centred board doesn't
    // shift as rows arrive.
    const boardContent = board.map((row, rowIndex) => (
      <View key={`sudoku-row-${rowIndex}`} style={styles.row}>
        {rowIndex < mountedRows &&
          row.map((value, colIndex) => (
            <CellContainer
              key={`sudoku-cell-r${rowIndex}-c${colIndex}`}
              rowIndex={rowIndex}
              colIndex={colIndex}
              value={value}
              selectedCell={selectedCell}
              highlightedNumber={highlightedNumber}
              isInitial={givens[rowIndex][colIndex] !== null}
              onCellPress={handleCellPress}
              revealStart={revealStart}
            />
          ))}
      </View>
    ));

    return (
      <View style={styles.boardContainer}>
        <Animated.View style={styles.board} entering={FadeInDown.duration(200)}>
          {boardContent}
        </Animated.View>

        {isNumberPadReady && (
          <NumberPad
            onNumberPress={handleNumberPress}
            onBackspace={handleBackspace}
            highlightedNumber={highlightedNumber}
          />
        )}
      </View>
    );
  },
);

SudokuBoard.displayName = 'SudokuBoard';

export const styles = StyleSheet.create({
  board: {
    alignItems: 'center',
    borderColor: COLORS.primary,
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 2,
    elevation: 8,
    height: BOARD_SIZE,
    justifyContent: 'center',
    overflow: 'hidden',
    shadowColor: COLORS.primary,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    width: BOARD_SIZE,
  },
  boardContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    height: CELL_SIZE,
  },
});

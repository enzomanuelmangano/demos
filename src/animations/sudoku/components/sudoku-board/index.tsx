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
  useMemo,
  useState,
} from 'react';

import Animated, {
  FadeIn,
  FadeInDown,
  useSharedValue,
} from 'react-native-reanimated';

import { SudokuGame } from '../../logic';
import { COLORS } from '../../theme';
import { NumberPad } from '../number-pad';
import { CellContainer } from './cell-container';
import { BOARD_SIZE } from './constants';

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
        selectedCell.value = game.getSelectedCell();
        highlightedNumber.value = game.getHighlightedNumber();
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

    const [isReady, setIsReady] = useState(false);
    const [isNumberPadReady, setIsNumberPadReady] = useState(false);

    useEffect(() => {
      const timer = setTimeout(() => {
        setIsReady(true);
      }, delay);
      const numberPadTimer = setTimeout(() => {
        setIsNumberPadReady(true);
      }, delay + 1600);

      return () => {
        clearTimeout(timer);
        clearTimeout(numberPadTimer);
      };
    }, [delay]);

    const boardContent = useMemo(() => {
      if (!isReady) return null;

      return board.map((row, rowIndex) => (
        <View key={`sudoku-row-${rowIndex}`} style={styles.row}>
          {row.map((value, colIndex) => (
            <Animated.View
              key={`sudoku-cell-r${rowIndex}-c${colIndex}`}
              entering={FadeIn.delay((rowIndex + colIndex) * 75).duration(350)}>
              <CellContainer
                rowIndex={rowIndex}
                colIndex={colIndex}
                value={value}
                board={board}
                selectedCell={selectedCell}
                highlightedNumber={highlightedNumber}
                initialBoard={game.getInitialBoard()}
                onCellPress={handleCellPress}
              />
            </Animated.View>
          ))}
        </View>
      ));
    }, [
      isReady,
      board,
      selectedCell,
      highlightedNumber,
      game,
      handleCellPress,
    ]);

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
  },
});

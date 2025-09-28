/**
 * Sudoku Game App
 *
 * This is the main application component for the Sudoku game.
 * It manages the game state, handles user interactions, and provides
 * a beautiful UI with animations and visual feedback.
 */

import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCallback, useRef, useState } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { PIConfetti } from 'react-native-fast-confetti';
import Animated, {
  FadeIn,
  FadeOut,
  FadeOutDown,
  FadeOutRight,
  LinearTransition,
} from 'react-native-reanimated';

import { Button } from './components/button';
import { SudokuBoard, type SudokuBoardRef } from './components/sudoku-board';
import { generateSudoku } from './logic';
import { COLORS, ELEVATION } from './theme';

import type { ConfettiMethods } from 'react-native-fast-confetti';

const Transition = LinearTransition;

// Generate initial board with medium difficulty
const { puzzle: INITIAL_BOARD } = generateSudoku('medium');

/**
 * Main App component that renders the Sudoku game interface
 */
export const Sudoku = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [board, setBoard] = useState(INITIAL_BOARD);
  const sudokuRef = useRef<SudokuBoardRef>(null);
  const confettiRef = useRef<ConfettiMethods>(null);

  const handleReset = useCallback(() => {
    Alert.alert(
      'New Game',
      'Are you sure you want to start a new game? Your current progress will be lost.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'New Game',
          style: 'destructive',
          onPress: () => {
            const { puzzle: newBoard } = generateSudoku('medium');
            setBoard(newBoard);
            setHasStarted(false);
          },
        },
      ],
    );
  }, []);

  const forceSolveWithConfetti = useCallback(
    (onSolved?: () => void) => {
      const solved = sudokuRef.current?.solve();
      if (solved) {
        setTimeout(() => {
          confettiRef.current?.restart();
          onSolved?.();
        }, 100);
      }
    },
    [sudokuRef, confettiRef],
  );

  const onGeniusLongPress = useCallback(() => {
    if (!hasStarted) {
      return;
    }
    forceSolveWithConfetti(() => {
      setTimeout(() => {
        Alert.alert('Genius!', 'Ready for another challenge?', [
          {
            text: 'OK',
            onPress: () => {
              setHasStarted(false);
            },
          },
        ]);
      }, 2000);
    });
  }, [hasStarted, forceSolveWithConfetti]);

  return (
    <View style={styles.safeArea}>
      <LinearGradient
        colors={[COLORS.background, COLORS.surface]}
        style={styles.container}>
        <Animated.View style={styles.content}>
          <Animated.View
            style={styles.header}
            key="header"
            entering={FadeIn.duration(1000)}
            layout={Transition}>
            <Pressable onLongPress={onGeniusLongPress}>
              <Text style={styles.title}>Sudoku</Text>
            </Pressable>
            <Text style={styles.subtitle}>Challenge your mind</Text>
            {hasStarted && (
              <Animated.View
                entering={FadeIn.duration(400)}
                style={styles.headerActions}>
                <Button
                  title="New Game"
                  variant="secondary"
                  size="small"
                  onPress={handleReset}
                  exiting={FadeOutDown.duration(200)}
                />
              </Animated.View>
            )}
          </Animated.View>

          <Animated.View
            style={styles.boardContainer}
            key="sudoku-board"
            layout={Transition}>
            {hasStarted ? (
              <Animated.View
                entering={FadeIn.duration(800)}
                exiting={FadeOut.duration(200)}
                key="sudoku"
                style={styles.boardWrapper}>
                <SudokuBoard ref={sudokuRef} initialBoard={board} delay={600} />
              </Animated.View>
            ) : (
              <View style={styles.startContainer}>
                <Button
                  title="Start Game"
                  onPress={() => setHasStarted(true)}
                  size="large"
                  style={styles.startButton}
                  exiting={FadeOutRight.duration(200)}
                />
              </View>
            )}
          </Animated.View>
        </Animated.View>
      </LinearGradient>
      <PIConfetti
        count={500}
        flakeSize={ConfettiFlakeSize}
        blastRadius={300}
        fallDuration={10000}
        blastDuration={1000}
        colors={ConfettiColors}
        fadeOutOnEnd
        ref={confettiRef}
      />
    </View>
  );
};

/**
 * Configuration for confetti animation
 */
const ConfettiFlakeSize = {
  width: 10,
  height: 10,
} as const;

/**
 * Color palette for confetti animation
 */
const ConfettiColors = [
  COLORS.primary,
  COLORS.primaryLight,
  COLORS.primaryTransparent,
  COLORS.highlight,
  COLORS.highlightTransparent,
  COLORS.highlightStrong,
];

const styles = StyleSheet.create({
  boardContainer: {
    ...ELEVATION.medium,
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderCurve: 'continuous',
    borderRadius: 16,
    justifyContent: 'center',
    minHeight: 160,
    minWidth: '100%',
    overflow: 'hidden',
    padding: 16,
  },
  boardWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  container: {
    flex: 1,
  },
  content: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    alignItems: 'center',
    marginBottom: 48,
  },
  headerActions: {
    marginTop: 16,
  },
  safeArea: {
    backgroundColor: COLORS.background,
    flex: 1,
  },
  startButton: {
    minWidth: 200,
  },
  startContainer: {
    alignItems: 'center',
    padding: 24,
  },
  subtitle: {
    color: COLORS.textTertiary,
    fontSize: 15,
    letterSpacing: 0.3,
    marginTop: 6,
  },
  title: {
    color: COLORS.text,
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
});

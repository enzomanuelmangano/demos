/**
 * Sudoku Game App
 *
 * This is the main application component for the Sudoku game.
 * It manages the game state, handles user interactions, and provides
 * a beautiful UI with animations and visual feedback.
 */

import React, { useState, useRef, useCallback } from 'react';
import { StyleSheet, View, Text, Alert, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  FadeIn,
  FadeOut,
  FadeOutDown,
  FadeOutRight,
  LinearTransition,
} from 'react-native-reanimated';
import type { ConfettiMethods } from 'react-native-fast-confetti';
import { PIConfetti } from 'react-native-fast-confetti';

import { generateSudoku } from './logic';
import { SudokuBoard, type SudokuBoardRef } from './components/sudoku-board';
import { Button } from './components/button';
import { COLORS, ELEVATION } from './theme';

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
      <StatusBar style="light" />
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
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
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
  title: {
    fontSize: 40,
    fontWeight: '700',
    color: COLORS.text,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.textTertiary,
    marginTop: 6,
    letterSpacing: 0.3,
  },
  boardContainer: {
    ...ELEVATION.medium,
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    padding: 16,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: '100%',
    minHeight: 160,
  },
  boardWrapper: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  startContainer: {
    alignItems: 'center',
    padding: 24,
  },
  startButton: {
    minWidth: 200,
  },
});

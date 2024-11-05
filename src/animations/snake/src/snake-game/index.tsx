import {
  BlurMask,
  Canvas,
  Path,
  rect,
  RoundedRect,
  rrect,
  Skia,
} from '@shopify/react-native-skia';
import React, { useCallback, useImperativeHandle } from 'react';
import {
  runOnJS,
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Directions,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';

import { useConst } from './use-const';
import { SnakeGame } from './snake-game';

// Define prop types for the SnakeBoard component
export type SnakeBoardProps = {
  n: number;
  boardSize: number;
  onGameOver?: () => void;
  onScoreChange?: (score: number) => void;
};

// Define ref type for the SnakeBoard component
export type SnakeBoardRef = {
  restart: () => void;
};

export const SnakeBoard = React.forwardRef<SnakeBoardRef, SnakeBoardProps>(
  ({ n, boardSize, onScoreChange, onGameOver }, ref) => {
    // Calculate board dimensions
    const rows = n;
    const columns = n;
    const squareSize = Math.floor(boardSize / n);

    // Initialize the snake game
    const snakeGame = useConst(
      () => new SnakeGame(rows, columns, squareSize, true),
    );

    // Create a shared value for the game state
    const gameState = useSharedValue(snakeGame.getState());

    // Wrapper function to change snake direction
    const changeDirectionWrapper = useCallback(
      (direction: Directions) => {
        snakeGame.changeDirection(direction);
      },
      [snakeGame],
    );

    // Expose restart function through ref
    useImperativeHandle(ref, () => ({
      restart: () => {
        snakeGame.clear();
        gameState.value = snakeGame.getState();
      },
    }));

    // Define gesture handlers for different directions
    const createFlingGesture = (direction: Directions) =>
      Gesture.Fling()
        .direction(direction)
        .onStart(() => {
          runOnJS(changeDirectionWrapper)(direction);
        });

    const gestures = Gesture.Simultaneous(
      createFlingGesture(Directions.LEFT),
      createFlingGesture(Directions.UP),
      createFlingGesture(Directions.RIGHT),
      createFlingGesture(Directions.DOWN),
    );

    // Function to update the game state
    const updateGame = useCallback(() => {
      snakeGame.move();

      gameState.value = snakeGame.getState();
    }, [gameState, snakeGame]);

    // Use frame callback to update game state
    const lastTimestamp = useSharedValue(0);
    useFrameCallback(frameInfo => {
      if (!frameInfo.timeSincePreviousFrame || gameState.value.isGameOver) {
        return;
      }

      const { timestamp } = frameInfo;
      if (timestamp - lastTimestamp.value > 120) {
        runOnJS(updateGame)();
        lastTimestamp.value = timestamp;
      }
    });

    // Handle game over event
    const onGameOverWrapper = useCallback(() => {
      onGameOver?.();
    }, [onGameOver]);

    useAnimatedReaction(
      () => gameState.value.isGameOver,
      isGameOver => {
        if (isGameOver) {
          runOnJS(onGameOverWrapper)();
        }
      },
    );

    // Handle score change event
    const onScoreChangeWrapper = useCallback(
      (score: number) => {
        onScoreChange?.(score);
      },
      [onScoreChange],
    );

    useAnimatedReaction(
      () => gameState.value.score,
      (score, prevScore) => {
        if (prevScore !== score) {
          runOnJS(onScoreChangeWrapper)(score);
        }
      },
    );

    // Create snake path for rendering
    const snakePath = useDerivedValue(() => {
      const skPath = Skia.Path.Make();
      gameState.value.snake.forEach(segment => {
        skPath.addRRect(
          rrect(
            rect(segment.x, segment.y, squareSize, squareSize),
            squareSize / 2,
            squareSize / 2,
          ),
        );
      });
      return skPath;
    }, [gameState.value.snake, squareSize]);

    // Create food path for rendering
    const foodPath = useDerivedValue(() => {
      const skPath = Skia.Path.Make();
      skPath.addRRect(
        rrect(
          rect(
            gameState.value.food?.x ?? 0,
            gameState.value.food?.y ?? 0,
            squareSize,
            squareSize,
          ),
          squareSize,
          squareSize,
        ),
      );
      return skPath;
    }, [gameState.value.food?.x, gameState.value.food?.y, squareSize]);

    // Create blur mask for game over effect
    const gameOverBlurMask = useDerivedValue(() => {
      return withTiming(gameState.value.isGameOver ? 50 : 0, {
        duration: 1000,
      });
    }, []);

    // Render the game board
    return (
      <GestureDetector gesture={gestures}>
        <Canvas
          style={{
            width: rows * squareSize,
            height: columns * squareSize,
          }}>
          <RoundedRect
            x={0}
            y={0}
            width={rows * squareSize}
            height={columns * squareSize}
            r={10}
            color={'#ebebec'}
          />
          <Path path={snakePath} color={'#68DE45'} />
          <Path path={foodPath} color={'#e75b5b'} />
          <BlurMask blur={gameOverBlurMask} />
        </Canvas>
      </GestureDetector>
    );
  },
);

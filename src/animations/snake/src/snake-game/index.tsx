import { forwardRef, useCallback, useImperativeHandle } from 'react';

import {
  BlurMask,
  Canvas,
  Path,
  rect,
  RoundedRect,
  rrect,
  Skia,
} from '@shopify/react-native-skia';
import {
  Directions,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import {
  useAnimatedReaction,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { SnakeGame } from './snake-game';
import { useConst } from './use-const';

export type SnakeBoardProps = {
  n: number;
  boardSize: number;
  onGameOver?: () => void;
  onScoreChange?: (score: number) => void;
  onDirectionChange?: (direction: Directions) => void;
};

export type SnakeBoardRef = {
  restart: () => void;
};

export const SnakeBoard = forwardRef<SnakeBoardRef, SnakeBoardProps>(
  ({ n, boardSize, onScoreChange, onGameOver, onDirectionChange }, ref) => {
    const rows = n;
    const columns = n;
    const squareSize = Math.floor(boardSize / n);

    const snakeGame = useConst(
      () => new SnakeGame(rows, columns, squareSize, true),
    );

    const gameState = useSharedValue(snakeGame.getState());

    const changeDirectionWrapper = useCallback(
      (direction: Directions) => {
        snakeGame.changeDirection(direction);
        onDirectionChange?.(direction);
      },
      [onDirectionChange, snakeGame],
    );

    useImperativeHandle(ref, () => ({
      restart: () => {
        snakeGame.clear();
        gameState.value = snakeGame.getState();
      },
    }));

    const createFlingGesture = (direction: Directions) =>
      Gesture.Fling()
        .direction(direction)
        .onStart(() => {
          scheduleOnRN(changeDirectionWrapper, direction);
        });

    const gestures = Gesture.Simultaneous(
      createFlingGesture(Directions.LEFT),
      createFlingGesture(Directions.UP),
      createFlingGesture(Directions.RIGHT),
      createFlingGesture(Directions.DOWN),
    );

    const updateGame = useCallback(() => {
      snakeGame.move();

      gameState.value = snakeGame.getState();
    }, [gameState, snakeGame]);

    const lastTimestamp = useSharedValue(0);
    useFrameCallback(frameInfo => {
      if (!frameInfo.timeSincePreviousFrame || gameState.value.isGameOver) {
        return;
      }

      const { timestamp } = frameInfo;
      if (timestamp - lastTimestamp.value > 120) {
        scheduleOnRN(updateGame);
        lastTimestamp.value = timestamp;
      }
    });

    const onGameOverWrapper = useCallback(() => {
      onGameOver?.();
    }, [onGameOver]);

    useAnimatedReaction(
      () => gameState.value.isGameOver,
      isGameOver => {
        if (isGameOver) {
          scheduleOnRN(onGameOverWrapper);
        }
      },
    );

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
          scheduleOnRN(onScoreChangeWrapper, score);
        }
      },
    );

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

    const gameOverBlurMask = useDerivedValue(() => {
      return withTiming(gameState.value.isGameOver ? 50 : 0, {
        duration: 1000,
      });
    }, []);

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

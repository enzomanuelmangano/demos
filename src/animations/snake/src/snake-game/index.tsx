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
        gameState.set(snakeGame.getState());
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

      gameState.set(snakeGame.getState());
    }, [gameState, snakeGame]);

    const lastTimestamp = useSharedValue(0);
    useFrameCallback(frameInfo => {
      if (!frameInfo.timeSincePreviousFrame || gameState.get().isGameOver) {
        return;
      }

      const { timestamp } = frameInfo;
      if (timestamp - lastTimestamp.get() > 120) {
        scheduleOnRN(updateGame);
        lastTimestamp.set(timestamp);
      }
    });

    const onGameOverWrapper = useCallback(() => {
      onGameOver?.();
    }, [onGameOver]);

    useAnimatedReaction(
      () => gameState.get().isGameOver,
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
      () => gameState.get().score,
      (score, prevScore) => {
        if (prevScore !== score) {
          scheduleOnRN(onScoreChangeWrapper, score);
        }
      },
    );

    const snakePath = useDerivedValue(() => {
      const builder = Skia.PathBuilder.Make();
      gameState.get().snake.forEach(segment => {
        builder.addRRect(
          rrect(
            rect(segment.x, segment.y, squareSize, squareSize),
            squareSize / 2,
            squareSize / 2,
          ),
        );
      });
      return builder.build();
    }, [gameState.get().snake, squareSize]);

    const foodPath = useDerivedValue(() => {
      const builder = Skia.PathBuilder.Make();
      builder.addRRect(
        rrect(
          rect(
            gameState.get().food?.x ?? 0,
            gameState.get().food?.y ?? 0,
            squareSize,
            squareSize,
          ),
          squareSize,
          squareSize,
        ),
      );
      return builder.build();
    }, [gameState.get().food?.x, gameState.get().food?.y, squareSize]);

    const gameOverBlurMask = useDerivedValue(() => {
      return withTiming(gameState.get().isGameOver ? 50 : 0, {
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

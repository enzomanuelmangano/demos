import { useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';

import { Canvas, Path, rect, Skia } from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useDerivedValue,
  useSharedValue,
  useAnimatedReaction,
} from 'react-native-reanimated';

const GRID_SIZE = 28; // 28x28
const CELL_SIZE = 10;
const PADDING = 1;
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE;

const createSquarePath = (i: number, j: number) => {
  'worklet';
  return rect(
    i * CELL_SIZE + PADDING,
    j * CELL_SIZE + PADDING,
    CELL_SIZE - PADDING * 2,
    CELL_SIZE - PADDING * 2,
  );
};

const getSurroundingCoords = (i: number, j: number) => {
  'worklet';
  return [
    [i - 1, j], // left
    [i + 1, j], // right
    [i, j - 1], // up
    [i, j + 1], // down
  ];
};

const isWithinBounds = (x: number, y: number) => {
  'worklet';
  return x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE;
};

export interface GridHandleRef {
  clear: () => void;
}

type GridProps = {
  onUpdate: (squaresGrid: number[][]) => void;
  initialTouchedSquares?: string[];
};

export const Grid = forwardRef<GridHandleRef, GridProps>(
  ({ onUpdate, initialTouchedSquares = [] }, ref) => {
    const touchedSquares = useSharedValue<string[]>(initialTouchedSquares);

    const surroundingSquareCoords = useDerivedValue(() => {
      'worklet';
      return touchedSquares.value.map(square => {
        const [i, j] = square.split(',').map(Number);
        return getSurroundingCoords(i, j)
          .map(coord => coord.join(','))
          .flat();
      });
    });

    useAnimatedReaction(
      () => touchedSquares.value,
      updatedTouchedSquares => {
        const baseSquares = Array.from({ length: GRID_SIZE }, () =>
          Array(GRID_SIZE).fill(0),
        );
        if (!onUpdate) {
          return;
        }

        for (let i = 0; i < GRID_SIZE; i++) {
          for (let j = 0; j < GRID_SIZE; j++) {
            const square = `${j},${i}`;
            const isTouched = updatedTouchedSquares.includes(square);

            baseSquares[i][j] = isTouched ? 1 : 0;
          }
        }

        onUpdate(baseSquares);
      },
    );

    useImperativeHandle(ref, () => ({
      clear: () => {
        touchedSquares.value = [];
      },
    }));

    const touchEvent = useCallback(
      (event: { x: number; y: number }) => {
        'worklet';
        const i = Math.floor(event.x / CELL_SIZE);
        const j = Math.floor(event.y / CELL_SIZE);

        if (isWithinBounds(i, j)) {
          touchedSquares.value = [...touchedSquares.value, `${i},${j}`];
        }
      },
      [touchedSquares],
    );

    const panGesture = Gesture.Pan().onBegin(touchEvent).onUpdate(touchEvent);

    const squarePaths = useMemo(() => {
      const skPath = Skia.Path.Make();
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          skPath.addRect(createSquarePath(i, j));
        }
      }
      return skPath;
    }, []);

    const touchedSquarePaths = useDerivedValue(() => {
      const skPath = Skia.Path.Make();
      touchedSquares.value.forEach(square => {
        const [i, j] = square.split(',').map(Number);
        skPath.addRect(createSquarePath(i, j));
      });
      return skPath;
    }, [touchedSquares]);

    const surroundingSquarePaths = useDerivedValue(() => {
      const skPath = Skia.Path.Make();
      surroundingSquareCoords.value.forEach(coord => {
        for (const c of coord) {
          const [x, y] = c.split(',').map(Number);
          if (
            isWithinBounds(x, y) &&
            !touchedSquares.value.includes(`${x},${y}`)
          ) {
            skPath.addRect(createSquarePath(x, y));
          }
        }
      });
      return skPath;
    }, [surroundingSquareCoords]);

    return (
      <GestureDetector gesture={panGesture}>
        <Canvas style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
          <Path path={squarePaths} color="#181818" />
          <Path path={surroundingSquarePaths} color="#9e9e9e" />
          <Path path={touchedSquarePaths} color="#d5d5d5" />
        </Canvas>
      </GestureDetector>
    );
  },
);

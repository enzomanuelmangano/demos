import { useCallback, useMemo, useImperativeHandle, forwardRef } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import {
  useDerivedValue,
  useSharedValue,
  useAnimatedReaction,
} from 'react-native-reanimated';
import { Canvas, Path, rect, Skia } from 'react-native-skia';

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
      // Plain loops: inline .map callbacks get hoisted out of the worklet by
      // React Compiler (as `_temp`) and crash the UI thread when called.
      const squares = touchedSquares.get();
      const result: string[][] = [];
      for (let s = 0; s < squares.length; s++) {
        const parts = squares[s].split(',');
        const i = Number(parts[0]);
        const j = Number(parts[1]);
        const surrounding = getSurroundingCoords(i, j);
        const coords: string[] = [];
        for (let k = 0; k < surrounding.length; k++) {
          coords.push(`${surrounding[k][0]},${surrounding[k][1]}`);
        }
        result.push(coords);
      }
      return result;
    });

    useAnimatedReaction(
      () => touchedSquares.get(),
      updatedTouchedSquares => {
        // Plain loop: Array.from's callback isn't workletized inside this
        // reaction and crashes the UI thread (same as staggered-card-number).
        const baseSquares: number[][] = [];
        for (let i = 0; i < GRID_SIZE; i++) {
          baseSquares.push(new Array(GRID_SIZE).fill(0));
        }
        if (!onUpdate) {
          return;
        }

        // Mark each touched cell directly (O(n)) instead of 784 string
        // lookups into the touched list. Square "x,y" lands in row y, col x.
        for (let s = 0; s < updatedTouchedSquares.length; s++) {
          const parts = updatedTouchedSquares[s].split(',');
          const x = Number(parts[0]);
          const y = Number(parts[1]);
          if (isWithinBounds(x, y)) {
            baseSquares[y][x] = 1;
          }
        }

        onUpdate(baseSquares);
      },
    );

    useImperativeHandle(ref, () => ({
      clear: () => {
        touchedSquares.set([]);
      },
    }));

    const touchEvent = useCallback(
      (event: { x: number; y: number }) => {
        'worklet';
        const i = Math.floor(event.x / CELL_SIZE);
        const j = Math.floor(event.y / CELL_SIZE);

        if (!isWithinBounds(i, j)) {
          return;
        }
        // Pan updates fire many times per cell. A cell that is already touched
        // changes neither the paths nor the prediction, so skip it instead of
        // growing the list (and re-running predict) on every event.
        const square = `${i},${j}`;
        const squares = touchedSquares.get();
        if (squares.includes(square)) {
          return;
        }
        touchedSquares.set([...squares, square]);
      },
      [touchedSquares],
    );

    const panGesture = Gesture.Pan().onBegin(touchEvent).onUpdate(touchEvent);

    const squarePaths = useMemo(() => {
      const builder = Skia.PathBuilder.Make();
      for (let i = 0; i < GRID_SIZE; i++) {
        for (let j = 0; j < GRID_SIZE; j++) {
          builder.addRect(createSquarePath(i, j));
        }
      }
      return builder.build();
    }, []);

    const touchedSquarePaths = useDerivedValue(() => {
      const builder = Skia.PathBuilder.Make();
      const squares = touchedSquares.get();
      for (let s = 0; s < squares.length; s++) {
        const parts = squares[s].split(',');
        const i = Number(parts[0]);
        const j = Number(parts[1]);
        builder.addRect(createSquarePath(i, j));
      }
      return builder.build();
    }, [touchedSquares]);

    const surroundingSquarePaths = useDerivedValue(() => {
      const builder = Skia.PathBuilder.Make();
      const groups = surroundingSquareCoords.get();
      const touched = touchedSquares.get();
      // Flag grid for O(1) "is touched" checks (was an includes() per neighbour).
      const touchedFlags = new Uint8Array(GRID_SIZE * GRID_SIZE);
      for (let s = 0; s < touched.length; s++) {
        const parts = touched[s].split(',');
        const x = Number(parts[0]);
        const y = Number(parts[1]);
        if (isWithinBounds(x, y)) {
          touchedFlags[x * GRID_SIZE + y] = 1;
        }
      }
      for (let g = 0; g < groups.length; g++) {
        const coords = groups[g];
        for (let c = 0; c < coords.length; c++) {
          const parts = coords[c].split(',');
          const x = Number(parts[0]);
          const y = Number(parts[1]);
          if (isWithinBounds(x, y) && !touchedFlags[x * GRID_SIZE + y]) {
            builder.addRect(createSquarePath(x, y));
          }
        }
      }
      return builder.build();
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

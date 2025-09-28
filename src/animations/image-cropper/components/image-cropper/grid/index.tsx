import {
  Group,
  Path,
  Rect,
  Skia,
  clamp,
  rect,
} from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

import { useCornerGestures } from './useCornerGestures';

import type { SharedValue } from 'react-native-reanimated';

type GridProps = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  width: SharedValue<number>;
  height: SharedValue<number>;
  maxHeight: number;
  maxWidth: number;
  dotRadius?: number;
  minWidth: number;
  minHeight: number;
};

const Grid: React.FC<GridProps> = ({
  x,
  y,
  width: gridWidth,
  height: gridHeight,
  maxHeight,
  maxWidth,
  dotRadius = 8,
  minWidth,
  minHeight,
}) => {
  const path = useDerivedValue(() => {
    const area = Skia.Path.Make();
    area.addRect(rect(x.value, y.value, gridWidth.value, gridHeight.value));
    return area;
  }, [x, y, gridWidth, gridHeight]);

  // Here I'm manually building the grid path.
  // The code could have been much simpler if I used a loop, but I wanted to
  // visualize the grid and the path it creates while I was building it.
  const grid = useDerivedValue(() => {
    const gridPath = Skia.Path.Make();

    const width = gridWidth.value;
    const height = gridHeight.value;

    gridPath.moveTo(x.value, height / 3 + y.value);
    gridPath.lineTo(width + x.value, height / 3 + y.value);

    gridPath.moveTo(x.value, (height / 3) * 2 + y.value);
    gridPath.lineTo(width + x.value, (height / 3) * 2 + y.value);

    gridPath.moveTo(x.value, height + y.value);
    gridPath.lineTo(width + x.value, height + y.value);

    gridPath.moveTo(width / 3 + x.value, y.value);
    gridPath.lineTo(width / 3 + x.value, height + y.value);

    gridPath.moveTo((width / 3) * 2 + x.value, y.value);
    gridPath.lineTo((width / 3) * 2 + x.value, height + y.value);

    gridPath.moveTo(width + x.value, y.value);
    gridPath.lineTo(width + x.value, height + y.value);

    gridPath.moveTo(x.value, y.value);
    gridPath.lineTo(x.value, height + y.value);

    gridPath.moveTo(x.value, y.value);
    gridPath.lineTo(width + x.value, y.value);

    return gridPath;
  }, [x, y, gridWidth, gridHeight]);

  const ctx = useSharedValue({ x: 0, y: 0 });
  // This gesture handler is used to move the grid around.
  const gesture = useGestureHandler({
    onStart: () => {
      'worklet';
      ctx.value = { x: x.value, y: y.value };
    },
    onActive: event => {
      'worklet';
      x.value =
        clamp(
          event.translationX,
          -ctx.value.x,
          maxWidth - gridWidth.value - ctx.value.x,
        ) + ctx.value.x;
      y.value =
        clamp(
          event.translationY,
          -ctx.value.y,
          maxHeight - gridHeight.value - ctx.value.y,
        ) + ctx.value.y;
    },
  });

  const { onDragTopLeft, onDragTopRight, onDragBottomLeft, onDragBottomRight } =
    useCornerGestures({
      x,
      y,
      gridWidth,
      gridHeight,
      maxWidth,
      maxHeight,
      minWidth,
      minHeight,
    });

  const topRightX = useDerivedValue(() => {
    return gridWidth.value + x.value;
  }, [gridWidth, x]);

  const bottomLeftY = useDerivedValue(() => {
    return gridHeight.value + y.value;
  }, [gridHeight, y]);

  const bottomRightX = useDerivedValue(() => {
    return gridWidth.value + x.value;
  }, [gridWidth, x]);

  const bottomRightY = useDerivedValue(() => {
    return gridHeight.value + y.value;
  }, [gridHeight, y]);

  return (
    <>
      {/* 
        Here's the trick to display the overlay :) 
        We draw a rectangle with a transparent color and we clip it with the grid path.
        The result is that the grid is visible and the rest of the screen is darkened.
      */}
      <Path path={grid} color={'white'} style={'stroke'} strokeWidth={2.5} />
      <Group clip={path} invertClip>
        <Rect
          rect={rect(0, 0, maxWidth, maxHeight)}
          color={'rgba(0,0,0,0.4)'}
        />
      </Group>
      <Touchable.Path path={path} color={'transparent'} {...gesture} />
      {/* TopLeftCorner */}
      <Touchable.Circle
        cx={x}
        cy={y}
        r={dotRadius}
        color={'white'}
        {...onDragTopLeft}
      />
      {/* TopRightCorner */}
      <Touchable.Circle
        cx={topRightX}
        cy={y}
        r={dotRadius}
        color={'white'}
        {...onDragTopRight}
      />
      {/* BottomLeftCorner */}
      <Touchable.Circle
        cx={x}
        cy={bottomLeftY}
        r={dotRadius}
        color={'white'}
        {...onDragBottomLeft}
      />
      {/* BottomRightCorner */}
      <Touchable.Circle
        cx={bottomRightX}
        cy={bottomRightY}
        r={dotRadius}
        color={'white'}
        {...onDragBottomRight}
      />
    </>
  );
};

export { Grid };

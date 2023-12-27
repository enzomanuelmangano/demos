import type { SkiaMutableValue } from '@shopify/react-native-skia';
import {
  Group,
  Path,
  Rect,
  Skia,
  clamp,
  rect,
  useComputedValue,
} from '@shopify/react-native-skia';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';

import { useCornerGestures } from './useCornerGestures';

type GridProps = {
  x: SkiaMutableValue<number>;
  y: SkiaMutableValue<number>;
  width: SkiaMutableValue<number>;
  height: SkiaMutableValue<number>;
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
  const path = useComputedValue(() => {
    const area = Skia.Path.Make();
    area.addRect(
      rect(x.current, y.current, gridWidth.current, gridHeight.current),
    );
    return area;
  }, [x, y, gridWidth, gridHeight]);

  // Here I'm manually building the grid path.
  // The code could have been much simpler if I used a loop, but I wanted to
  // visualize the grid and the path it creates while I was building it.
  const grid = useComputedValue(() => {
    const gridPath = Skia.Path.Make();

    const width = gridWidth.current;
    const height = gridHeight.current;

    gridPath.moveTo(x.current, height / 3 + y.current);
    gridPath.lineTo(width + x.current, height / 3 + y.current);

    gridPath.moveTo(x.current, (height / 3) * 2 + y.current);
    gridPath.lineTo(width + x.current, (height / 3) * 2 + y.current);

    gridPath.moveTo(x.current, height + y.current);
    gridPath.lineTo(width + x.current, height + y.current);

    gridPath.moveTo(width / 3 + x.current, y.current);
    gridPath.lineTo(width / 3 + x.current, height + y.current);

    gridPath.moveTo((width / 3) * 2 + x.current, y.current);
    gridPath.lineTo((width / 3) * 2 + x.current, height + y.current);

    gridPath.moveTo(width + x.current, y.current);
    gridPath.lineTo(width + x.current, height + y.current);

    gridPath.moveTo(x.current, y.current);
    gridPath.lineTo(x.current, height + y.current);

    gridPath.moveTo(x.current, y.current);
    gridPath.lineTo(width + x.current, y.current);

    return gridPath;
  }, [x, y, gridWidth, gridHeight]);

  // This gesture handler is used to move the grid around.
  const gesture = useGestureHandler<{
    x: number;
    y: number;
  }>({
    onStart: (_, ctx) => {
      ctx.x = x.current;
      ctx.y = y.current;
    },
    onActive: (event, ctx) => {
      x.current =
        clamp(
          event.translationX,
          -ctx.x,
          maxWidth - gridWidth.current - ctx.x,
        ) + ctx.x;
      y.current =
        clamp(
          event.translationY,
          -ctx.y,
          maxHeight - gridHeight.current - ctx.y,
        ) + ctx.y;
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

  const topRightX = useComputedValue(() => {
    return gridWidth.current + x.current;
  }, [gridWidth, x]);

  const bottomLeftY = useComputedValue(() => {
    return gridHeight.current + y.current;
  }, [gridHeight, y]);

  const bottomRightX = useComputedValue(() => {
    return gridWidth.current + x.current;
  }, [gridWidth, x]);

  const bottomRightY = useComputedValue(() => {
    return gridHeight.current + y.current;
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

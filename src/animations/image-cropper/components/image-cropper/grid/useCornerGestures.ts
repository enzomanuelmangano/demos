import type { SkiaMutableValue } from '@shopify/react-native-skia';
import { clamp } from '@shopify/react-native-skia';
import { useGestureHandler } from 'react-native-skia-gesture';

type UseCornerGesturesParams = {
  x: SkiaMutableValue<number>;
  y: SkiaMutableValue<number>;
  gridWidth: SkiaMutableValue<number>;
  gridHeight: SkiaMutableValue<number>;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
};

// There must be a better way of dealing with each corner gesture.
// To be honest I've tried to let Chat GPT work. But the final result wasn't readable.
// So I've decided to go with this approach (even if it's not dry).
// I'm totally open to suggestions.

// Each function in this hook is quite similar to the others.
// Each one is responsible for a corner of the grid.
// The only difference is the way the grid is resized.
const useCornerGestures = ({
  x,
  y,
  gridWidth,
  gridHeight,
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
}: UseCornerGesturesParams) => {
  const onDragTopLeft = useGestureHandler<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    onStart: (_, ctx) => {
      ctx.x = x.current;
      ctx.y = y.current;
      ctx.width = gridWidth.current;
      ctx.height = gridHeight.current;
    },
    onActive: (event, ctx) => {
      const newGridWidth = clamp(
        -event.translationX + ctx.width,
        minWidth,
        maxWidth - x.current,
      );
      const newGridHeight = clamp(
        -event.translationY + ctx.height,
        minHeight,
        maxHeight - y.current,
      );
      gridHeight.current = newGridHeight;
      gridWidth.current = newGridWidth;
      x.current = clamp(event.translationX + ctx.x, 0, maxWidth - newGridWidth);
      y.current = clamp(
        event.translationY + ctx.y,
        0,
        maxHeight - newGridHeight,
      );
    },
  });

  const onDragTopRight = useGestureHandler<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    onStart: (_, ctx) => {
      ctx.x = x.current;
      ctx.y = y.current;
      ctx.width = gridWidth.current;
      ctx.height = gridHeight.current;
    },
    onActive: (event, ctx) => {
      const newGridWidth = clamp(
        event.translationX + ctx.width,
        minWidth,
        maxWidth - x.current,
      );
      const newGridHeight = clamp(
        -event.translationY + ctx.height,
        minHeight,
        maxHeight - y.current,
      );
      gridHeight.current = newGridHeight;
      gridWidth.current = newGridWidth;
      y.current = clamp(
        event.translationY + ctx.y,
        0,
        maxHeight - newGridHeight,
      );
    },
  });

  const onDragBottomLeft = useGestureHandler<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    onStart: (_, ctx) => {
      ctx.x = x.current;
      ctx.y = y.current;
      ctx.width = gridWidth.current;
      ctx.height = gridHeight.current;
    },
    onActive: (event, ctx) => {
      const newGridWidth = clamp(
        -event.translationX + ctx.width,
        minWidth,
        maxWidth - x.current,
      );
      const newGridHeight = clamp(
        event.translationY + ctx.height,
        minHeight,
        maxHeight - y.current,
      );
      gridHeight.current = newGridHeight;
      gridWidth.current = newGridWidth;
      x.current = clamp(event.translationX + ctx.x, 0, maxWidth - newGridWidth);
    },
  });

  const onDragBottomRight = useGestureHandler<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>({
    onStart: (_, ctx) => {
      ctx.x = x.current;
      ctx.y = y.current;
      ctx.width = gridWidth.current;
      ctx.height = gridHeight.current;
    },
    onActive: (event, ctx) => {
      const newGridWidth = clamp(
        event.translationX + ctx.width,
        minWidth,
        maxWidth - x.current,
      );
      const newGridHeight = clamp(
        event.translationY + ctx.height,
        minHeight,
        maxHeight - y.current,
      );
      gridHeight.current = newGridHeight;
      gridWidth.current = newGridWidth;
    },
  });

  return {
    onDragTopLeft,
    onDragTopRight,
    onDragBottomLeft,
    onDragBottomRight,
  };
};

export { useCornerGestures };

import { clamp } from '@shopify/react-native-skia';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';
import { useGestureHandler } from 'react-native-skia-gesture';

type UseCornerGesturesParams = {
  x: SharedValue<number>;
  y: SharedValue<number>;
  gridWidth: SharedValue<number>;
  gridHeight: SharedValue<number>;
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
};

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
  const ctx = useSharedValue({
    x: x.get(),
    y: y.get(),
    width: gridWidth.get(),
    height: gridHeight.get(),
  });

  const updateContext = () => {
    'worklet';
    ctx.set({
      x: x.get(),
      y: y.get(),
      width: gridWidth.get(),
      height: gridHeight.get(),
    });
  };

  const calculateNewDimensions = (
    translationX: number,
    translationY: number,
    isNegativeX: boolean,
    isNegativeY: boolean,
  ) => {
    'worklet';
    const newWidth = clamp(
      (isNegativeX ? -translationX : translationX) + ctx.get().width,
      minWidth,
      maxWidth - x.get(),
    );
    const newHeight = clamp(
      (isNegativeY ? -translationY : translationY) + ctx.get().height,
      minHeight,
      maxHeight - y.get(),
    );
    return { newWidth, newHeight };
  };

  const createCornerHandler = (
    isNegativeX: boolean,
    isNegativeY: boolean,
    updateX: boolean,
    updateY: boolean,
  ) => {
    // @@TODO: how come this works? 😅
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useGestureHandler({
      onStart: updateContext,
      onActive: event => {
        'worklet';
        const { newWidth, newHeight } = calculateNewDimensions(
          event.translationX,
          event.translationY,
          isNegativeX,
          isNegativeY,
        );
        gridWidth.set(newWidth);
        gridHeight.set(newHeight);
        if (updateX) {
          x.set(
            clamp(event.translationX + ctx.get().x, 0, maxWidth - newWidth),
          );
        }
        if (updateY) {
          y.set(
            clamp(event.translationY + ctx.get().y, 0, maxHeight - newHeight),
          );
        }
      },
    });
  };

  return {
    onDragTopLeft: createCornerHandler(true, true, true, true),
    onDragTopRight: createCornerHandler(false, true, false, true),
    onDragBottomLeft: createCornerHandler(true, false, true, false),
    onDragBottomRight: createCornerHandler(false, false, false, false),
  };
};

export { useCornerGestures };

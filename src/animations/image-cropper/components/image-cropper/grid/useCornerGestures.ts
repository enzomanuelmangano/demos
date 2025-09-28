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
    x: x.value,
    y: y.value,
    width: gridWidth.value,
    height: gridHeight.value,
  });

  const updateContext = () => {
    'worklet';
    ctx.value = {
      x: x.value,
      y: y.value,
      width: gridWidth.value,
      height: gridHeight.value,
    };
  };

  const calculateNewDimensions = (
    translationX: number,
    translationY: number,
    isNegativeX: boolean,
    isNegativeY: boolean,
  ) => {
    'worklet';
    const newWidth = clamp(
      (isNegativeX ? -translationX : translationX) + ctx.value.width,
      minWidth,
      maxWidth - x.value,
    );
    const newHeight = clamp(
      (isNegativeY ? -translationY : translationY) + ctx.value.height,
      minHeight,
      maxHeight - y.value,
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
        gridWidth.value = newWidth;
        gridHeight.value = newHeight;
        if (updateX) {
          x.value = clamp(
            event.translationX + ctx.value.x,
            0,
            maxWidth - newWidth,
          );
        }
        if (updateY) {
          y.value = clamp(
            event.translationY + ctx.value.y,
            0,
            maxHeight - newHeight,
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

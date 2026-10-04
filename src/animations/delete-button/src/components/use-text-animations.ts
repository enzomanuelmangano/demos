import { useDerivedValue, withTiming } from 'react-native-reanimated';

import type { SharedValue } from 'react-native-reanimated';
import type { SkFont } from 'react-native-skia';

type UseTextAnimationsParams = {
  isToggled: SharedValue<boolean>;
  deleteButtonRectX: SharedValue<number>;
  width: number;
  font: SkFont;
  initialText: string;
  confirmText: string;
};

export const useTextAnimations = ({
  isToggled,
  deleteButtonRectX,
  width,
  font,
  initialText,
  confirmText,
}: UseTextAnimationsParams) => {
  // The labels never change, so measure them once here instead of on every
  // frame of the spring.
  const initialTextWidth = font.measureText(initialText).width;
  const confirmTextWidth = font.measureText(confirmText).width;

  const deleteTextX = useDerivedValue(() => {
    return deleteButtonRectX.get() + width / 2 - initialTextWidth / 2;
  }, [initialTextWidth, deleteButtonRectX, width]);

  const deleteTextOpacity = useDerivedValue(() => {
    return withTiming(isToggled.get() ? 0 : 1);
  }, []);

  const confirmTextX = useDerivedValue(() => {
    return deleteButtonRectX.get() + width / 2 - confirmTextWidth / 2;
  }, [confirmTextWidth, deleteButtonRectX, width]);

  const confirmTextOpacity = useDerivedValue(() => {
    return withTiming(isToggled.get() ? 1 : 0);
  }, []);

  return {
    deleteTextX,
    deleteTextOpacity,
    confirmTextX,
    confirmTextOpacity,
  };
};

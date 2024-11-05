import type { SkFont } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import { useDerivedValue, withTiming } from 'react-native-reanimated';

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
  const deleteTextX = useDerivedValue(() => {
    const textWidth = font.measureText(initialText).width;
    return deleteButtonRectX.value + width / 2 - textWidth / 2;
  }, [font, deleteButtonRectX, width]);

  const deleteTextOpacity = useDerivedValue(() => {
    return withTiming(isToggled.value ? 0 : 1);
  }, []);

  const confirmTextX = useDerivedValue(() => {
    const textWidth = font.measureText(confirmText).width;
    return deleteButtonRectX.value + width / 2 - textWidth / 2;
  }, [font, deleteButtonRectX, width]);

  const confirmTextOpacity = useDerivedValue(() => {
    return withTiming(isToggled.value ? 1 : 0);
  }, []);

  return {
    deleteTextX,
    deleteTextOpacity,
    confirmTextX,
    confirmTextOpacity,
  };
};

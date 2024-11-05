import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const BOTTOM_BAR_HEIGHT = 70;

const LINEAR_GRADIENT_HEIGHT = 100;

export const useSafeBottomBarHeight = () => {
  const { bottom: safeBottom } = useSafeAreaInsets();

  return BOTTOM_BAR_HEIGHT + safeBottom + 15 + LINEAR_GRADIENT_HEIGHT;
};

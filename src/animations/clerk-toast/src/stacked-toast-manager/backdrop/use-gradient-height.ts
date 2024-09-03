import { useContext } from 'react';
import { useWindowDimensions } from 'react-native';

import { InternalStackedToastContext } from '../context';
import { MAX_VISIBLE_TOASTS, TOAST_HEIGHT } from '../constants';

export const useGradientHeight = () => {
  const { stackedToasts } = useContext(InternalStackedToastContext);
  const { height: windowHeight } = useWindowDimensions();
  const gradientHeight =
    Math.min(stackedToasts.length, MAX_VISIBLE_TOASTS) * (TOAST_HEIGHT + 90);
  return Math.min(gradientHeight, windowHeight / 2);
};

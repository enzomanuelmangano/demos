import { useWindowDimensions } from 'react-native';

import { useContext } from 'react';

import { MAX_VISIBLE_TOASTS, TOAST_HEIGHT } from '../constants';
import { InternalStackedToastContext } from '../context';

export const useGradientHeight = () => {
  const { stackedToasts } = useContext(InternalStackedToastContext);
  const { height: windowHeight } = useWindowDimensions();
  const gradientHeight =
    Math.min(stackedToasts.length, MAX_VISIBLE_TOASTS) * (TOAST_HEIGHT + 90);
  return Math.min(gradientHeight, windowHeight / 2);
};

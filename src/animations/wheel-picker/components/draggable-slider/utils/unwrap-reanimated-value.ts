import type { SharedValue } from 'react-native-reanimated';
import { isSharedValue } from 'react-native-reanimated';

export const unwrapReanimatedValue = <T>(value: T | SharedValue<T>): T => {
  'worklet';
  return isSharedValue(value) ? value.value : value;
};

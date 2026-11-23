import { Easing } from 'react-native-reanimated';

// Super recommended: https://easing.dev/

export const EasingsUtils = {
  // https://www.easing.dev/in-out-base
  inOut: Easing.bezier(0.25, 0.1, 0.25, 1),
};

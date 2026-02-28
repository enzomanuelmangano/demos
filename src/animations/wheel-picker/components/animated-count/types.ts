import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type AnimatedCountProps = {
  count: SharedValue<number>;
  maxDigits: number;
  textDigitHeight?: number;
  textDigitWidth?: number;
  fontSize?: number;
  color?: string;
  gradientAccentColor?: string;
  style?: StyleProp<ViewStyle>;
};

import type { SkFont } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';

export type RadarDataType<K extends string> = {
  color?: string;
  values: { [key in K]: number };
}[];

export type RadarChartProps<K extends string> = {
  data: Readonly<SharedValue<RadarDataType<K>>> | Readonly<RadarDataType<K>>;
  strokeWidth?: number;
  internalLayers?: number;
  showGrid?: boolean;
  strokeColor?: string;
  font?: SkFont | null;
  style?: StyleProp<ViewStyle>;
};

import type { SkFont, SkiaValue } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';

export type RadarDataType<K extends string> = {
  color?: string;
  values: { [key in K]: number };
}[];

export type RadarChartProps<K extends string> = {
  data: Readonly<SkiaValue<RadarDataType<K>>> | Readonly<RadarDataType<K>>;
  strokeWidth?: number;
  internalLayers?: number;
  showGrid?: boolean;
  strokeColor?: string;
  font?: SkFont | null;
  style?: StyleProp<ViewStyle>;
};

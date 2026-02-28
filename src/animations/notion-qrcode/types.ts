import type { DataSourceParam } from '@shopify/react-native-skia';

export type Point3D = { x: number; y: number; z: number };

export interface SpriteConfig {
  source: DataSourceParam;
  cols: number;
  rows: number;
  cellSize: number;
  numAvatars: number;
}

export interface ColorConfig {
  hue: number; // 0-360
  saturationRange: [number, number]; // [min, max] %
  lightnessRange: [number, number]; // [min, max] %
}

export interface TorusConfig {
  majorRadius: number;
  minorRadius: number;
  targetHeight: number;
}

export interface QRCodeAnimationRef {
  toggle: () => void;
}

export interface QRCodeAnimationProps {
  qrData: string;
  sprite: SpriteConfig;
  colors?: ColorConfig;
  torus?: TorusConfig;
  avatarSize?: number;
  qrTargetHeight?: number;
  /** Optional external progress value (0-1). If not provided, uses internal state. */
  progress?: import('react-native-reanimated').SharedValue<number>;
  /** Optional zoom level (0 = normal, 1 = zoomed out to see full donut). */
  zoom?: import('react-native-reanimated').SharedValue<number>;
  /** Ref to control the animation via toggle() */
  ref?: React.RefObject<QRCodeAnimationRef | null>;
}

export interface ShapeData {
  allShapes: [Point3D[], Point3D[]];
  nPoints: number;
  qrSize: number;
  qrModuleSize: number;
  avatarAssignments: number[];
  spriteCoords: Array<{ x: number; y: number; w: number; h: number }>;
}

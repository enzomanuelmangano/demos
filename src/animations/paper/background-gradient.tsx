import {
  Blur,
  Canvas,
  Rect,
  SweepGradient,
  vec,
} from '@shopify/react-native-skia';
import { StyleSheet, useWindowDimensions } from 'react-native';

export const BackgroundGradient = () => {
  const { width, height } = useWindowDimensions();
  return (
    <Canvas style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={width} height={height} color={'#ededed'}>
        <SweepGradient
          c={vec(width / 2, height / 2)}
          colors={['#eaeaea', '#e9ebec', '#dddddd', '#e0e0e0']}
        />
        <Blur blur={50} />
      </Rect>
    </Canvas>
  );
};

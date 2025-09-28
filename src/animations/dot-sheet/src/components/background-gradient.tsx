import { useWindowDimensions } from 'react-native';

import { Blur, Canvas, Fill, SweepGradient } from '@shopify/react-native-skia';

import type { StyleProp, ViewStyle } from 'react-native';

type BackgroundGradientProps = {
  style?: StyleProp<ViewStyle>;
};

const GRADIENT_COLORS = [
  '#cda2a8',
  '#daacb2',
  '#A9828D',
  '#d5b1b7',
  '#cfb5b9',
  '#eac5bd',
  '#F0EEF1',
  '#F0EEF1',
  '#FFFFFF',
];

// This background gradient was a bit tricky to recreate.
// The trick was to use a SweepGradient with a lot of colors + blur mask.
export const BackgroundGradient: React.FC<BackgroundGradientProps> = ({
  style,
}) => {
  const { width, height } = useWindowDimensions();

  return (
    <Canvas
      style={[
        {
          width,
          height,
        },
        style,
      ]}>
      <Fill>
        <SweepGradient
          colors={GRADIENT_COLORS}
          c={{
            x: width / 2,
            y: height / 2,
          }}
        />
        {/* Check what happens without the Blur :) */}
        <Blur blur={55} />
      </Fill>
    </Canvas>
  );
};

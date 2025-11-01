import { Circle, Group } from '@shopify/react-native-skia';

import type { SharedValue } from 'react-native-reanimated';

type NetworkNodeProps = {
  coord: { x: number; y: number };
  opacity: SharedValue<number>;
};

export const NetworkNode: React.FC<NetworkNodeProps> = ({ coord, opacity }) => {
  const circleRadius = 2.5;

  return (
    <Group key={coord.x}>
      <Circle
        cx={coord.x}
        cy={coord.y}
        r={circleRadius}
        color={'white'}
        opacity={opacity}
      />
      <Circle
        cx={coord.x}
        cy={coord.y}
        r={circleRadius}
        color={'white'}
        style={'stroke'}
      />
    </Group>
  );
};

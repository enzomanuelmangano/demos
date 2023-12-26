import type { SkiaValue } from '@shopify/react-native-skia';
import { FitBox, Group, Path, rect } from '@shopify/react-native-skia';
import React from 'react';

import { BOTTOM_BAR_ICONS } from './svg-icons';

type BottomTabItemProps = {
  iconColor: SkiaValue<Float32Array>;
  index: number;
  iconSize: number;
};

const BottomTabItemContent: React.FC<BottomTabItemProps> = React.memo(
  ({ iconColor, index, iconSize }) => {
    const icon = BOTTOM_BAR_ICONS[index]!;

    return (
      <Group>
        <FitBox src={icon.src} dst={rect(0, 0, iconSize, iconSize)}>
          <Path color={iconColor} path={icon.path} />
        </FitBox>
      </Group>
    );
  },
);

export { BottomTabItemContent };

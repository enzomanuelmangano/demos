import { FitBox, Group, Path, rect } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { type SharedValue } from 'react-native-reanimated';

import { BOTTOM_BAR_ICONS } from './svg-icons';

type BottomTabItemProps = {
  iconColor: SharedValue<string>;
  index: number;
  iconSize: number;
};

const BottomTabItemContent: React.FC<BottomTabItemProps> = React.memo(
  ({ iconColor, index, iconSize }) => {
    const icon = BOTTOM_BAR_ICONS[index]!;

    const dst = useMemo(() => {
      return rect(0, 0, iconSize, iconSize);
    }, [iconSize]);

    return (
      <Group>
        <FitBox src={icon.src} dst={dst}>
          <Path color={iconColor} path={icon.path} />
        </FitBox>
      </Group>
    );
  },
);

export { BottomTabItemContent };

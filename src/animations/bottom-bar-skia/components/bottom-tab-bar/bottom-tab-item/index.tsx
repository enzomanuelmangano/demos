import { FitBox, Group, Path, rect } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import {
  interpolateColor,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import Touchable from 'react-native-skia-gesture';

import { BOTTOM_BAR_ICONS } from './svg-icons';

type BottomTabIconProps = {
  x: number;
  y: number;
  onTap: () => void;
  height: number;
  width: number;
  currentIndex: number;
  index: number;
};

const iconSize = 30;

const TimingConfig = {
  duration: 200,
};

const BottomTabItem: React.FC<BottomTabIconProps> = React.memo(
  ({ x, y, height, width, onTap, currentIndex, index }) => {
    const isActive = index === currentIndex;

    const baseTranslateY = y + height / 2 - iconSize / 2 - 8;

    const translateY = useDerivedValue(() => {
      return withTiming(
        isActive ? baseTranslateY - 35 : baseTranslateY,
        TimingConfig,
      );
    }, [baseTranslateY, isActive]);

    const iconColorProgress = useDerivedValue(() => {
      return withTiming(isActive ? 1 : 0, TimingConfig);
    }, [isActive]);

    const iconColor = useDerivedValue(() => {
      return interpolateColor(
        iconColorProgress.value,
        [0, 1],
        ['#7E6CE2', '#FFFFFF'],
      );
    }, [iconColorProgress]);

    const transform = useDerivedValue(() => {
      return [
        { translateX: x + width / 2 - iconSize / 2 },
        {
          translateY: translateY.value,
        },
      ];
    }, [translateY]);

    const icon = BOTTOM_BAR_ICONS[index]!;

    const dst = useMemo(() => {
      return rect(0, 0, iconSize, iconSize);
    }, []);

    return (
      <Group>
        <Touchable.Rect
          x={x}
          onTap={onTap}
          height={height}
          width={width}
          y={y}
          color="transparent"
        />
        <Group transform={transform}>
          <FitBox src={icon.src} dst={dst}>
            <Path path={icon.path} color={iconColor} />
          </FitBox>
        </Group>
      </Group>
    );
  },
);

export { BottomTabItem };

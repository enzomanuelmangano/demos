import { Group } from '@shopify/react-native-skia';
import React from 'react';
import Touchable from 'react-native-skia-gesture';
import {
  interpolateColor,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { BottomTabItemContent } from './bottom-tab-item-content';

type BottomTabIconProps = {
  x: number;
  y: number;
  onEnd: () => void;
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
  ({ x, y, height, width, onEnd, currentIndex, index }) => {
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

    return (
      <Group>
        <Touchable.Rect
          x={x}
          onEnd={onEnd}
          height={height}
          width={width}
          y={y}
          color="transparent"
        />
        <Group transform={transform}>
          <BottomTabItemContent
            iconColor={iconColor}
            index={index}
            iconSize={iconSize}
          />
        </Group>
      </Group>
    );
  },
);

export { BottomTabItem };

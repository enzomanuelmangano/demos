import {
  runTiming,
  useValue,
  interpolateColors,
  useComputedValue,
  Group,
} from '@shopify/react-native-skia';
import React, { useEffect } from 'react';
import Touchable from 'react-native-skia-gesture';

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

const timingConfig = {
  duration: 200,
};

const BottomTabItem: React.FC<BottomTabIconProps> = React.memo(
  ({ x, y, height, width, onEnd, currentIndex, index }) => {
    const isActive = index === currentIndex;

    const baseTranslateY = y + height / 2 - iconSize / 2 - 8;
    const translateY = useValue(baseTranslateY);
    const iconColorProgress = useValue(0);
    const iconColor = useComputedValue(() => {
      return interpolateColors(
        iconColorProgress.current,
        [0, 1],
        ['#7E6CE2', '#FFFFFF'],
      );
    }, [iconColorProgress]);

    const transform = useComputedValue(() => {
      return [
        { translateX: x + width / 2 - iconSize / 2 },
        {
          translateY: translateY.current,
        },
      ];
    }, [translateY]);

    useEffect(() => {
      if (isActive) {
        runTiming(translateY, baseTranslateY - 35, timingConfig);
        runTiming(iconColorProgress, 1, timingConfig);
      } else {
        runTiming(translateY, baseTranslateY, timingConfig);
        runTiming(iconColorProgress, 0, timingConfig);
      }
    }, [baseTranslateY, iconColorProgress, isActive, translateY]);

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

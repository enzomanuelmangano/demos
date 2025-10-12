import { type FC, memo, useMemo } from 'react';

import { FitBox, Group, Path, rect } from '@shopify/react-native-skia';
import {
  interpolateColor,
  useDerivedValue,
  withSpring,
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

const DurationConfig = {
  duration: 400,
  dampingRatio: 1,
};

const BottomTabItem: FC<BottomTabIconProps> = memo(
  ({ x, y, height, width, onTap, currentIndex, index }) => {
    const isActive = index === currentIndex;

    const baseTranslateY = y + height / 2 - iconSize / 2 - 8;

    const translateY = useDerivedValue(() => {
      return withSpring(
        isActive ? baseTranslateY - 35 : baseTranslateY,
        DurationConfig,
      );
    }, [baseTranslateY, isActive]);

    const iconColorProgress = useDerivedValue(() => {
      return withTiming(isActive ? 1 : 0, DurationConfig);
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

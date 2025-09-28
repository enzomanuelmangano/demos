import { Group, RoundedRect } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Touchable, { useGestureHandler } from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';

import type { FC } from 'react';
import type { SharedValue } from 'react-native-reanimated';

type SelectableSquareProps = {
  cx: SharedValue<number>;
  cy: SharedValue<number>;
  size: number;
  color: string;
  onSelect?: () => void;
  selectedIndex: SharedValue<number>;
  index: number;
  borderColor?: string;
};

const SelectableSquare: FC<SelectableSquareProps> = ({
  cx,
  cy,
  size,
  color,
  onSelect,
  selectedIndex,
  borderColor = 'white',
  index,
}) => {
  const scale = useSharedValue(1);

  const touchableHandler = useGestureHandler({
    onStart: () => {
      'worklet';
      scale.value = withSpring(0.9);
    },
    onTap: () => {
      'worklet';
      scale.value = withSpring(1);
      if (onSelect) {
        scheduleOnRN(onSelect);
      }
    },
  });

  const transform = useDerivedValue(() => {
    return [{ scale: scale.value }];
  }, [scale]);

  const origin = useDerivedValue(() => {
    return {
      x: cx.value + size / 2,
      y: cy.value + size / 2,
    };
  }, [cx, cy]);

  const animatedColor = useDerivedValue(() => {
    return selectedIndex.value === index ? borderColor : color;
  }, [color, borderColor, selectedIndex, index]);

  return (
    <Group origin={origin} transform={transform}>
      <Touchable.RoundedRect
        x={cx}
        y={cy}
        width={size}
        height={size}
        r={100}
        color={color}
        {...touchableHandler}
      />
      <RoundedRect
        x={cx}
        y={cy}
        width={size}
        height={size}
        r={100}
        strokeWidth={2}
        color={animatedColor}
        style={'stroke'}
      />
    </Group>
  );
};

type SelectableSquareContainerProps = Omit<
  SelectableSquareProps,
  'cx' | 'cy'
> & {
  coordinates: SharedValue<{ cx: number; cy: number }[]>;
};

const SelectableSquareContainer: FC<SelectableSquareContainerProps> = ({
  coordinates,
  index,
  ...props
}) => {
  const cx = useDerivedValue(
    () => coordinates.value[index]?.cx || 0,
    [coordinates, index],
  );
  const cy = useDerivedValue(
    () => coordinates.value[index]?.cy || 0,
    [coordinates, index],
  );

  return <SelectableSquare cx={cx} cy={cy} {...props} index={index} />;
};

export { SelectableSquareContainer };

import type { SkFont } from '@shopify/react-native-skia';
import {
  BlurMask,
  Circle,
  Group,
  Shadow,
  Skia,
  Text,
} from '@shopify/react-native-skia';
import { useMemo } from 'react';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import Touchable from 'react-native-skia-gesture';
import { scheduleOnRN } from 'react-native-worklets';
import { BackgroundDots } from './background-dots';
import { Donut } from './donut';
import { Picker } from './picker';

type CircularSliderProps = {
  width: number;
  height: number;
  strokeWidth?: number;
  font: SkFont;
  minVal?: number;
  maxVal?: number;
  onValueChange?: (value: number) => void;
};

// The CircularSlider component creates an interactive, circular slider using Skia.
// It combines various sub-components to create a visually appealing and functional
// circular slider with a donut-shaped progress indicator, background dots,
// and a picker for user interaction.
export const CircularSlider: React.FC<CircularSliderProps> = ({
  width,
  height,
  strokeWidth = 70,
  font,
  onValueChange,
  maxVal = 100,
  minVal = 0,
}) => {
  const internalOffset = 20;
  const initialAngleRad = Math.PI / 2;
  const cx = width / 2;
  const cy = height / 2;
  const radius = (width - internalOffset - strokeWidth) / 2;

  const translateX = useSharedValue(cx);
  const translateY = useSharedValue(0);

  const progress = useDerivedValue(() => {
    const x = translateX.value - cx;
    const y = translateY.value - cy;
    let theta = Math.atan2(y, x) + initialAngleRad;
    if (theta < 0) theta += 2 * Math.PI;
    return theta / (2 * Math.PI);
  }, [translateX.value, translateY.value]);

  const circlePath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addCircle(cx, cy, radius + strokeWidth / 2);
    return path;
  }, [cx, cy, radius, strokeWidth]);

  const animatedValue = useDerivedValue(() => {
    return Math.min(Math.round(progress.value * maxVal) + minVal, maxVal);
  }, [progress.value]);

  const currentTextValue = useDerivedValue(() => {
    return animatedValue.value.toString();
  }, [animatedValue.value]);

  const textPositionX = useDerivedValue(() => {
    return cx - font.measureText(currentTextValue.value).width / 2 - 2;
  }, [font, cx]);

  useAnimatedReaction(
    () => animatedValue.value,
    (curr, prev) => {
      if (prev == null) return;
      if (onValueChange) scheduleOnRN(onValueChange, curr);
    },
  );

  return (
    <Touchable.Canvas style={{ width, height }}>
      <Group>
        <Circle cx={cx} cy={cy} r={radius + strokeWidth / 2} color={'#ebebeb'}>
          <BlurMask blur={30} style={'inner'} />
        </Circle>
        <Circle
          cx={cx}
          cy={cy}
          r={radius + strokeWidth / 2 + 2}
          color={'#f7f7f7'}>
          <Shadow dx={0} dy={20} blur={10} color="#e9e9e9" inner />
          <BlurMask blur={10} style={'inner'} />
        </Circle>
      </Group>

      <BackgroundDots
        cx={cx}
        cy={cy}
        radius={radius}
        initialAngleRad={initialAngleRad}
      />

      <Donut
        cx={cx}
        cy={cy}
        radius={radius}
        strokeWidth={strokeWidth}
        progress={progress}
        initialAngleRad={initialAngleRad}
      />

      <Group clip={circlePath}>
        <Donut
          cx={cx}
          cy={cy}
          radius={radius}
          strokeWidth={strokeWidth}
          progress={progress}
          initialAngleRad={initialAngleRad}>
          <BlurMask blur={100} style={'solid'} />
        </Donut>
      </Group>

      <Group clip={circlePath}>
        <Picker
          cx={cx}
          cy={cy}
          radius={radius}
          strokeWidth={strokeWidth}
          translateX={translateX}
          translateY={translateY}
        />
      </Group>

      <Circle
        cx={cx}
        cy={cy}
        r={radius - strokeWidth / 2}
        color={'#222222'}
        opacity={0.5}>
        <BlurMask blur={20} style={'solid'} />
      </Circle>
      <Circle cx={cx} cy={cy} r={radius - strokeWidth / 2} color={'#FFFFFF'} />

      <Text
        text={currentTextValue}
        color={'#111'}
        x={textPositionX}
        y={cy + font.getSize() / 3}
        font={font}
      />
    </Touchable.Canvas>
  );
};

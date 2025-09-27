import type { SkFont, TextProps } from '@shopify/react-native-skia';
import { Group, Text } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  Extrapolation,
  interpolate,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

type TextCodeProps = {
  containerWidth: number;
  code: string;
  textY: number;
  font: SkFont | null;
  children?: React.ReactNode;
  color?: string;
  highlightedPoint: SharedValue<{
    x: number;
    y: number;
  } | null>;
};

const TextCode: React.FC<TextCodeProps> = ({
  textY,
  containerWidth,
  code,
  font,
  children,
  color = 'white',
  highlightedPoint,
}) => {
  const textWidth = font?.measureText(code).width || 0;

  return (
    <Group>
      {code
        .toString()
        .split('')
        .map((char, index) => {
          const spacingBetweenLetters = (index * textWidth) / code.length;
          const marginHorizontal = (containerWidth - textWidth) / 2 - 5;

          const charX = spacingBetweenLetters + marginHorizontal;

          return (
            <ScaleableCharacter
              key={index}
              x={charX}
              y={textY}
              text={char}
              color={color}
              font={font}
              highlightedPoint={highlightedPoint}
            />
          );
        })}
      {children}
    </Group>
  );
};

const ScaleableCharacter: React.FC<
  TextProps & {
    highlightedPoint: SharedValue<{
      x: number;
      y: number;
    } | null>;
  }
> = ({ highlightedPoint, x, y, ...rest }) => {
  const distance = useDerivedValue(() => {
    if (highlightedPoint.value === null) return withTiming(80);
    const dx = x - highlightedPoint.value.x;
    const dy = y - highlightedPoint.value.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  const transform = useDerivedValue(() => {
    const scale = interpolate(
      distance.value,
      [0, 80],
      [1, 0.5],
      Extrapolation.CLAMP,
    );

    return [{ scale }];
  });

  const origin = useMemo(() => {
    if (!rest.font || !rest.text) return { x, y };

    return {
      x: x + rest.font?.measureText(rest.text).width / 2,
      y: y - rest.font?.getSize() / 3,
    };
  }, [x, y, rest.font, rest.text]);

  return (
    <Group transform={transform} origin={origin}>
      <Text x={x} y={y} {...rest} />
    </Group>
  );
};

export { TextCode };

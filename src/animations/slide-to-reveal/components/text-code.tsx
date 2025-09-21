// Import necessary types and components from external packages
import type { SkFont, TextProps } from '@shopify/react-native-skia';
import { Group, Text } from '@shopify/react-native-skia';
import { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import {
  Extrapolate,
  interpolate,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

// Define the props for the TextCode component
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

// Define the TextCode component
const TextCode: React.FC<TextCodeProps> = ({
  textY,
  containerWidth,
  code,
  font,
  children,
  color = 'white',
  highlightedPoint,
}) => {
  // Calculate the total width of the text based on the font
  const textWidth = font?.getTextWidth(code) || 0;

  // Render the component
  return (
    <Group>
      {code
        .toString()
        .split('')
        .map((char, index) => {
          // Calculate the horizontal position for each character
          const spacingBetweenLetters = (index * textWidth) / code.length;
          const marginHorizontal = (containerWidth - textWidth) / 2 - 5;

          const charX = spacingBetweenLetters + marginHorizontal;

          // Render a ScaleableCharacter component for each character
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

// Define the ScaleableCharacter component
const ScaleableCharacter: React.FC<
  TextProps & {
    highlightedPoint: SharedValue<{
      x: number;
      y: number;
    } | null>;
  }
> = ({ highlightedPoint, x, y, ...rest }) => {
  // Calculate the distance between the character and the highlighted point
  const distance = useDerivedValue(() => {
    if (highlightedPoint.value === null) return withTiming(80);
    const dx = x - highlightedPoint.value.x;
    const dy = y - highlightedPoint.value.y;
    return Math.sqrt(dx * dx + dy * dy);
  });

  // Calculate the scale based on the distance
  const transform = useDerivedValue(() => {
    const scale = interpolate(
      distance.value,
      [0, 80],
      [1, 0.5],
      Extrapolate.CLAMP,
    );

    return [{ scale }];
  });

  // Calculate the origin for scaling
  const origin = useMemo(() => {
    if (!rest.font || !rest.text) return { x, y };

    return {
      x: x + rest.font?.getTextWidth(rest.text) / 2,
      y: y - rest.font?.getSize() / 3,
    };
  }, [x, y, rest.font, rest.text]);

  // Render the scaled Text component
  return (
    <Group transform={transform} origin={origin}>
      <Text x={x} y={y} {...rest} />
    </Group>
  );
};

// Export the TextCode component
export { TextCode };

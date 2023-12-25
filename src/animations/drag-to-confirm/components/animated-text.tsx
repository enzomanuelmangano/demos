import {
  Group,
  SkFont,
  SkiaValue,
  Text,
  useCanvas,
  useComputedValue,
} from '@shopify/react-native-skia';
import React from 'react';

type AnimatedTextProps = {
  text: string;
  font?: SkFont;
  fontSize: SkiaValue<number>;
  color?: string;
  progress: SkiaValue<number>;
};

const AnimatedCenteredText: React.FC<AnimatedTextProps> = ({
  font,
  fontSize,
  text,
  color,
  progress,
}) => {
  const { size } = useCanvas();

  const width = useComputedValue(() => size.current.width, [size]);
  const height = useComputedValue(() => size.current.height, [size]);

  const fontX = useComputedValue(
    () => width.current / 2 - (font?.getTextWidth(text) ?? 0) / 2,
    [width, font, text]
  );
  const fontY = useComputedValue(
    () => height.current / 2 + fontSize.current / 4,
    [height, fontSize]
  );

  const transform = useComputedValue(() => {
    return [{ scale: progress.current }];
  }, [progress]);

  const origin = useComputedValue(() => {
    return { x: width.current / 2, y: height.current / 2 };
  }, [width, height]);

  return (
    <Group opacity={progress} origin={origin} transform={transform}>
      <Text x={fontX} y={fontY} text={text} font={font as any} color={color} />
    </Group>
  );
};

export { AnimatedCenteredText };

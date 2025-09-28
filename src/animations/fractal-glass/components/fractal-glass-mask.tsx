import { Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';

type FractalGlassMaskProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  gradientsN: number;
};

export const FractalGlassMask: React.FC<FractalGlassMaskProps> = ({
  x,
  y,
  width,
  height,
  gradientsN,
}) => {
  return (
    <Group>
      {new Array(gradientsN).fill(0).map((_, index) => {
        const gradientWidth = width / gradientsN;
        const gradientX = x + gradientWidth * index;

        return new Array(gradientsN).fill(0).map((__, j) => {
          const gradientHeight = height / gradientsN;
          const gradientY = y + gradientHeight * j;

          return (
            <Rect
              key={j}
              x={gradientX}
              y={gradientY}
              width={gradientWidth}
              height={gradientHeight}>
              <LinearGradient
                colors={['white', 'rgba(0,0,0,0.45)']}
                start={vec(gradientX, gradientY)}
                end={vec(
                  gradientX + gradientWidth - 5,
                  gradientY + gradientHeight - 5,
                )}
              />
            </Rect>
          );
        });
      })}
    </Group>
  );
};

import {
  PixelRatio,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';

import { useMemo } from 'react';

import { PressableOpacity } from 'pressto';
import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  BackdropBlur,
  Blur,
  Canvas,
  Group,
  Image,
  Path,
  RadialGradient,
  rect,
  Rect,
  rrect,
  Skia,
  TileMode,
  vec,
} from 'react-native-skia';

import type { SharedValue } from 'react-native-reanimated';

type BlurredCardProps = {
  blurredProgress: SharedValue<number>;
};

const BlurredCard = ({ blurredProgress }: BlurredCardProps) => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const clipPath = useMemo(() => {
    const builder = Skia.PathBuilder.Make();
    const x = windowWidth / 2 - 150;
    const y = windowHeight / 2 - 100;
    const width = 300;
    const height = 200;
    const r = 20;
    builder.addRRect(rrect(rect(x, y, width, height), r, r));
    return builder.build();
  }, [windowWidth, windowHeight]);

  const blur = useDerivedValue(() => {
    return Math.max(5 * blurredProgress.get(), 0);
  });

  return (
    <Group>
      <Path path={clipPath} color={'rgba(255, 255, 255, 0.1)'} />
      <Path
        path={clipPath}
        style={'stroke'}
        strokeWidth={2}
        opacity={blurredProgress}
        color={'rgba(255, 255, 255, 0.2)'}
      />
      <BackdropBlur blur={blur} clip={clipPath} />
    </Group>
  );
};

// The blurred gradient never changes, but a sigma-100 blur re-ran on every
// frame of the card spring. Rasterize it once at device resolution (same
// gradient, same decal blur as the <Rect> + <Blur> below) and draw the image.
const useBlurredBackground = (width: number, height: number) => {
  return useMemo(() => {
    const pixelRatio = PixelRatio.get();
    const surface = Skia.Surface.MakeOffscreen(
      Math.round(width * pixelRatio),
      Math.round(height * pixelRatio),
    );
    if (!surface) return null;
    const canvas = surface.getCanvas();
    canvas.scale(pixelRatio, pixelRatio);
    const paint = Skia.Paint();
    paint.setShader(
      Skia.Shader.MakeRadialGradient(
        vec(width / 2, height / 2),
        Math.min(width, height) / 2,
        [Skia.Color('violet'), Skia.Color('black')],
        null,
        TileMode.Clamp,
      ),
    );
    paint.setImageFilter(
      Skia.ImageFilter.MakeBlur(100, 100, TileMode.Decal, null),
    );
    canvas.drawRect(rect(0, 0, width, height), paint);
    surface.flush();
    return surface.makeImageSnapshot().makeNonTextureImage();
  }, [width, height]);
};

export const BlurCards = () => {
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const progress = useSharedValue(0);
  const background = useBlurredBackground(windowWidth, windowHeight);

  return (
    <View style={styles.container}>
      <Canvas style={styles.canvas}>
        {background ? (
          <Image
            image={background}
            x={0}
            y={0}
            width={windowWidth}
            height={windowHeight}
            fit="fill"
          />
        ) : (
          <Rect x={0} y={0} width={windowWidth} height={windowHeight}>
            <RadialGradient
              c={vec(windowWidth / 2, windowHeight / 2)}
              r={Math.min(windowWidth, windowHeight) / 2}
              colors={['violet', 'black']}
            />
            <Blur blur={100} />
          </Rect>
        )}
        {new Array(5).fill(0).map((_, index) => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const transform = useDerivedValue(() => {
            return [
              {
                rotate: (-Math.PI / 2) * progress.get(),
              },
              {
                translateX: 25 * index * progress.get(),
              },
              { perspective: 10000 },
              {
                rotateY: (Math.PI / 3) * progress.get(),
              },
              {
                rotate: (Math.PI / 4) * progress.get(),
              },
            ];
          }, [index]);

          return (
            <Group
              key={index}
              origin={vec(windowWidth / 2, windowHeight / 2)}
              transform={transform}>
              <BlurredCard blurredProgress={progress} />
            </Group>
          );
        })}
      </Canvas>
      <PressableOpacity
        style={StyleSheet.absoluteFill}
        onPress={() => {
          progress.set(
            withSpring(progress.get() > 0.5 ? 0 : 1, {
              duration: 1500,
              dampingRatio: 0.7,
            }),
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
  },
  container: {
    backgroundColor: 'black',
    flex: 1,
  },
});

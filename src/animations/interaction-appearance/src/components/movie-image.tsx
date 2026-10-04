import { StyleSheet, View } from 'react-native';

import { useMemo } from 'react';

import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Blur, Canvas, Group, Image, rect, rrect } from 'react-native-skia';

import { isSwitchingThemeShared } from '../theme';

import type { SkImage } from 'react-native-skia';

type MovieImageProps = {
  skImage: SkImage | null;
  imageHeight: number;
  blur?: number;
};

// This one is a bit tricky.
// Honestly all these values are just there to make the image look good.
// This component would be a lot simpler if we didn't have to deal with the blur effect :)
// But it's worth it, the blur effect looks amazing!
export const MovieImage: React.FC<MovieImageProps> = ({
  skImage,
  blur,
  imageHeight,
}) => {
  const { top: safeTop } = useSafeAreaInsets();

  const blurImageOpacity = useDerivedValue(() => {
    if (!blur) {
      return 1;
    }

    if (isSwitchingThemeShared.get()) {
      return withTiming(0, {
        duration: 350,
      });
    }
    return withTiming(1, {
      duration: 1000,
    });
  }, [blur]);

  const canvasHeight = 300 + safeTop + 32;
  const imageY = (canvasHeight - imageHeight) / 2 + 32;

  const imageRoundedRect = useMemo(() => {
    if (blur) return undefined;
    return rrect(rect(32, imageY, 200, imageHeight), 20, 20);
  }, [blur, imageHeight, imageY]);

  const canvasStyle = useMemo(
    () =>
      ({
        // The blurred copy spreads far below the image; the sharp one fits
        // inside canvasHeight, so it doesn't need the extra surface.
        height: blur ? canvasHeight + 500 : canvasHeight,
        position: 'absolute',
        width: '100%',
      }) as const,
    [blur, canvasHeight],
  );

  // The opacity fade runs on the native view: the sigma-500 blur is drawn
  // once instead of being recomputed on every frame of the fade.
  const rCanvasStyle = useAnimatedStyle(() => {
    return {
      opacity: blurImageOpacity.get(),
    };
  }, []);

  return (
    <>
      <Animated.View style={[canvasStyle, rCanvasStyle]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group clip={imageRoundedRect}>
            <Image
              image={skImage}
              fit={'cover'}
              width={200}
              height={imageHeight}
              x={32}
              y={imageY}
            />
            {/* Try to comment this blur component to see how it impacts the layout */}
            {blur && <Blur blur={blur} />}
          </Group>
        </Canvas>
      </Animated.View>
      {!blur && (
        <View
          style={{
            height: canvasHeight,
            width: '100%',
            paddingTop: safeTop + 32,
          }}
        />
      )}
    </>
  );
};

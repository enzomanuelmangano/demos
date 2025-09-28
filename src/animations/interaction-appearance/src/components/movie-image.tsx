import { View } from 'react-native';

import { useMemo } from 'react';

import {
  Blur,
  Canvas,
  Group,
  Image,
  rect,
  rrect,
} from '@shopify/react-native-skia';
import { useDerivedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isSwitchingThemeShared } from '../theme';

import type { SkImage } from '@shopify/react-native-skia';

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

    if (isSwitchingThemeShared.value) {
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
        height: canvasHeight + 500,
        position: 'absolute',
        width: '100%',
      }) as const,
    [canvasHeight],
  );
  return (
    <>
      <Canvas style={canvasStyle}>
        <Group clip={imageRoundedRect} opacity={blurImageOpacity}>
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

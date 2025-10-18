import { StyleSheet } from 'react-native';

import { memo } from 'react';

import {
  Canvas,
  ColorMatrix,
  Group,
  Image,
  useImage,
} from '@shopify/react-native-skia';
import Animated, {
  Easing,
  interpolate,
  useDerivedValue,
  withTiming,
} from 'react-native-reanimated';

import { LayoutTransition } from './animations';

import type { ItemProps } from './types';

/**
 * Note on implementation choice:
 *
 * Using Skia for rendering images requires multiple canvases, which isn't ideal for performance.
 * A more practical approach would be to use expo-image with a native grayscale filter
 * (e.g., react-native-color-matrix-image-filters).
 *
 * However, this Skia approach provides smooth color interpolation during the online/offline
 * transition, which creates a better visual effect. Since this component is optimized for
 * development with Expo Go, Skia was chosen for its compatibility and ease of testing.
 *
 * For production apps, consider switching to expo-image for better performance.
 */

export const ListItem = memo(
  ({ item, leftPosition, itemSize, listColor, isOffline }: ItemProps) => {
    const image = useImage(item);

    const grayscaleProgress = useDerivedValue(() => {
      return withTiming(isOffline ? 1 : 0, {
        duration: 300,
        easing: Easing.linear,
      });
    }, [isOffline]);

    // Create animated color matrix
    const animatedColorMatrix = useDerivedValue(() => {
      const progress = grayscaleProgress.value;

      // Identity matrix (no filter)
      // prettier-ignore
      const identityMatrix = [
        1, 0, 0, 0, 0, // red channel
        0, 1, 0, 0, 0, // green channel
        0, 0, 1, 0, 0, // blue channel
        0, 0, 0, 1, 0, // alpha channel
      ];

      // Grayscale matrix
      // prettier-ignore
      const grayscaleMatrix = [
        0, 1, 0, 0, 0, // red channel
        0, 1, 0, 0, 0, // green channel
        0, 1, 0, 0, 0, // blue channel
        0, 0, 0, 1, 0, // alpha channel
      ];

      // Interpolate between identity and grayscale matrices
      return identityMatrix.map((identityValue, index) => {
        const grayscaleValue = grayscaleMatrix[index];
        return interpolate(progress, [0, 1], [identityValue, grayscaleValue]);
      });
    }, [grayscaleProgress]);

    return (
      <Animated.View
        key={item}
        layout={LayoutTransition}
        style={[
          styles.item,
          {
            left: leftPosition,
            width: itemSize,
            height: itemSize,
            borderRadius: itemSize / 2,
            borderColor: listColor,
            borderCurve: 'continuous',
          },
        ]}>
        {image && (
          <Canvas style={styles.canvas}>
            <Group>
              <Image
                image={image}
                x={0}
                y={0}
                width={itemSize}
                height={itemSize}
                fit="cover">
                <ColorMatrix matrix={animatedColorMatrix} />
              </Image>
            </Group>
          </Canvas>
        )}
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  canvas: {
    height: '100%',
    width: '100%',
  },
  item: {
    borderWidth: 3,
    overflow: 'hidden',
    position: 'absolute',
  },
});

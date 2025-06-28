import { Canvas, Rect, Shadow } from '@shopify/react-native-skia';
import { View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';

// Define the props type for the Paper component
type PaperProps = {
  height: number;
  width: number;
  progress: SharedValue<number>;
};

// I broke the react-hooks/rules-of-hooks rule in the Paper component
// We can easily fix it by creating separate components for the Fold
// But I honestly think, this code is much easier to understand (and the rules are made to be broken 😅).

// The component splits the Paper in 3 fold sections and animate them based on the progress value
// Each fold section will have a different animation based on the progress value to create a realistic paper folding effect
// The first fold will move up and down based on the progress value
// The second fold will rotate based on the progress value
// The third fold will rotate based on the progress value

// The trick is to transform each fold section based on the previous transformation.
export const Paper: React.FC<PaperProps> = ({ height, width, progress }) => {
  // Calculate the height of each fold section
  const foldHeight = height / 3;

  return (
    <View
      style={{
        height,
        width,
      }}>
      {new Array(3).fill(0).map((_, i) => {
        // Calculate z-index style for proper stacking in new architecture
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const rZIndexStyle = useAnimatedStyle(() => {
          // Calculate dynamic zIndex - higher values for elements that should be on top
          // In the paper folding, we want the first fold (index 0) to be on top
          const zIndex = (2 - i) * 100; // 200, 100, 0 for indices 0, 1, 2

          return {
            transformOrigin: ['50%', '50%', zIndex],
            transform: [{ perspective: 1000000 }],
          };
        }, []);

        // Calculate animated style for each fold section
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const rCardStyle = useAnimatedStyle(() => {
          // Interpolate translateY based on progress
          const translateY = interpolate(
            progress.value,
            [0, 1],
            [height / 2 - foldHeight / 2, 0],
          );

          // Base transform without perspective (since it's in the zIndex style now)
          const baseTransform = [{ translateY: translateY }];

          // First Fold Style
          if (i === 0) {
            return {
              transform: baseTransform,
            };
          }

          // Additional transforms for the second fold
          const secondFoldTransform = [
            ...baseTransform,
            { translateY: -foldHeight / 2 },
            {
              rotateX:
                interpolate(progress.value, [0, 1], [-Math.PI, 0]) + 'rad',
            },
            { translateY: foldHeight / 2 },
          ];

          // Second Fold Style
          if (i === 1) {
            return {
              top: height / 2 - foldHeight / 2,
              transform: secondFoldTransform,
            };
          }

          // Additional transforms for the third fold
          return {
            top: height / 2 - foldHeight / 2,
            transform: [
              ...secondFoldTransform,
              { translateY: foldHeight / 2 },
              {
                rotateX:
                  interpolate(progress.value, [0, 1], [Math.PI, 0]) + 'rad',
              },
              { translateY: -foldHeight / 2 },
              { translateY: height / 3 },
            ],
          };
        }, []);

        // To get the emphasis on the paper shadow, we can animate the color of each fold
        // In detail, the first fold won't have any shadow, and the shadow will be emphasized on the second and third fold
        // eslint-disable-next-line react-hooks/rules-of-hooks
        const rectColor = useDerivedValue(() => {
          if (i === 0) {
            return '#ffffff';
          }
          return interpolateColor(
            progress.value,
            [0, 1],
            ['#b1b1b1', '#ffffff'],
          );
        }, []);

        return (
          <Animated.View key={i} style={rZIndexStyle}>
            <Animated.View
              style={[
                {
                  position: 'absolute',
                  height: foldHeight,
                  width: width,
                },
                rCardStyle,
              ]}>
              <Canvas style={{ flex: 1 }}>
                <Rect width={width} height={foldHeight} color={rectColor}>
                  <Shadow
                    dx={0}
                    dy={12}
                    blur={25}
                    color="#efefef"
                    inner={i > 0}
                  />
                </Rect>
              </Canvas>
            </Animated.View>
          </Animated.View>
        );
      })}
    </View>
  );
};

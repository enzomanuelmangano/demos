import type { DataSourceParam } from '@shopify/react-native-skia';
import {
  Canvas,
  rect,
  useSVG,
  ImageSVG,
  Group,
  fitbox,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { useMemo } from 'react';

import { AnimatedSquares } from './animated-squares';

// Define the props type for the AtlasButton component
type AtlasButtonProps = {
  width: number;
  height: number;
  onPress?: () => void;
  label: string;
  labelStyle?: StyleProp<TextStyle>;
  svgIcon: DataSourceParam;
  iconSize?: number;
  colors: Array<Float32Array>;
  horizontalSquaresAmount?: number;
};

// Define the AtlasButton functional component
export const AtlasButton: React.FC<AtlasButtonProps> = ({
  width,
  height,
  onPress,
  svgIcon,
  label,
  iconSize: _iconSize,
  colors,
  horizontalSquaresAmount = 50,
}) => {
  const iconSize = width * 0.2; // Calculate icon size based on width or use provided iconSize

  const isActive = useSharedValue(false); // Shared value to track if the button is active
  const tapGesture = Gesture.Tap()
    .maxDuration(10000) // Set maximum duration for the tap gesture
    .onTouchesDown(() => {
      isActive.value = true; // Set isActive to true when the button is pressed
    })
    .onTouchesUp(() => {
      if (onPress) {
        runOnJS(onPress)(); // Call the onPress callback if provided
      }
    })
    .onFinalize(() => {
      isActive.value = false; // Reset isActive to false when the gesture is finalized
    });

  const progress = useDerivedValue<number>(() => {
    return withTiming(isActive.value ? 1 : 0, {
      duration: 1000, // Animate progress with a duration of 1000ms
      easing: Easing.bezier(0.25, 0.1, 0.25, 1), // Use a bezier easing function
    });
  });

  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          scale: interpolate(progress.value, [0, 1], [1, 0.95]), // Animate scale based on progress
        },
      ],
    };
  }, []);

  const imageSvg = useSVG(svgIcon); // Load the SVG icon

  const textStyle = useAnimatedStyle(() => {
    return {
      opacity: progress.value * 3, // Animate opacity based on progress
      top: interpolate(
        progress.value * 3,
        [0, 1],
        [50, 25],
        Extrapolation.CLAMP,
      ), // Animate top position based on progress
    };
  }, []);

  const iconStyle = useAnimatedStyle(() => {
    return {
      top: interpolate(
        progress.value * 3,
        [0, 1],
        [0, -25],
        Extrapolation.CLAMP,
      ), // Animate top position of the icon based on progress
    };
  }, []);

  const iconCanvasSize = useMemo(() => {
    return {
      width: iconSize,
      height: iconSize,
    }; // Memoize the icon canvas size
  }, [iconSize]);

  const iconTransform = useMemo(() => {
    if (!imageSvg) return fitbox('contain', rect(0, 0, 0, 0), rect(0, 0, 0, 0));
    return fitbox(
      'contain',
      rect(0, 0, imageSvg.width(), imageSvg.height()),
      rect(0, 0, iconSize, iconSize),
    ); // Memoize the icon transform
  }, [iconSize, imageSvg]);

  return (
    <GestureDetector gesture={tapGesture}>
      <Animated.View style={[rStyle, styles.center]}>
        <Canvas
          style={{
            width,
            height,
          }}>
          <AnimatedSquares
            progress={progress}
            width={width}
            height={height}
            colors={colors}
            horizontalSquaresAmount={horizontalSquaresAmount}
          />
        </Canvas>
        <Animated.View style={styles.content}>
          {imageSvg && (
            <Animated.View style={iconStyle}>
              <Canvas style={iconCanvasSize}>
                <Group transform={iconTransform}>
                  <ImageSVG svg={imageSvg} style={'fill'} />
                </Group>
              </Canvas>
            </Animated.View>
          )}
          <Animated.Text style={[styles.label, { width }, textStyle]}>
            {label}
          </Animated.Text>
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  content: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    textAlign: 'center',
    marginTop: 10,
    fontSize: 20,
    fontWeight: 'bold',
    color: 'white',
    position: 'absolute',
  },
});

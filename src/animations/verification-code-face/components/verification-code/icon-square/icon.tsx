import React, { forwardRef, useImperativeHandle } from 'react';
import { type ViewStyle } from 'react-native';
import type { AnimateStyle, SharedValue } from 'react-native-reanimated';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';
import type { SkPath } from '@shopify/react-native-skia';
import { Canvas, Path } from '@shopify/react-native-skia';

import { useIconPaths } from './useIconPaths';
import { Eye } from './eye';

// Define the props for the InternalIcon component
type InternalIconProps = {
  style: AnimateStyle<ViewStyle>;
  progress: SharedValue<number>;
};

// Define the ref methods for the InternalIcon component
export type InternalIconRef = {
  happy: () => void;
  sad: () => void;
  normal: () => void;
};

// Constants for the eyebrow and mouth canvas sizes and stroke widths
const EYEBROW_CANVAS_SIZE = { width: 15, height: 5 };
const EYEBROW_STROKE_WIDTH = 0.5;
const MOUTH_CANVAS_SIZE = { width: 25, height: 20 };
const MOUTH_STROKE_WIDTH = 2;
const PROGRESS_INPUT_RANGE = [0, 1];
const GAP_OUTPUT_RANGE = [7, 3];

// Eyebrow component that renders a path on a canvas
const Eyebrow = ({ path }: { path: SharedValue<SkPath> }) => (
  <Canvas style={EYEBROW_CANVAS_SIZE}>
    <Path
      path={path}
      color="white"
      style="stroke"
      strokeWidth={EYEBROW_STROKE_WIDTH}
    />
  </Canvas>
);

// InternalIcon component that uses forwardRef to expose methods to its parent
export const InternalIcon = forwardRef<InternalIconRef, InternalIconProps>(
  ({ style, progress }, ref) => {
    // Get the icon paths and methods from the useIconPaths hook
    const { mouthPath, eyebrowPath, happy, sad, normal } = useIconPaths();

    // Expose the happy, sad, and normal methods to the parent component
    useImperativeHandle(ref, () => ({
      happy,
      sad,
      normal,
    }));

    // Animated style for the gap between elements
    const animatedGap = useAnimatedStyle(() => ({
      gap: interpolate(progress.value, PROGRESS_INPUT_RANGE, GAP_OUTPUT_RANGE),
    }));

    // Animated style for the eyebrows
    const animatedEyebrowStyle = useAnimatedStyle(() => ({
      flexDirection: 'row' as const,
      gap: interpolate(progress.value, PROGRESS_INPUT_RANGE, GAP_OUTPUT_RANGE),
      marginBottom: interpolate(
        progress.value,
        PROGRESS_INPUT_RANGE,
        GAP_OUTPUT_RANGE,
      ),
    }));

    // Animated style for the eyes
    const animatedEyeStyle = useAnimatedStyle(() => ({
      flexDirection: 'row' as const,
      gap: interpolate(progress.value, PROGRESS_INPUT_RANGE, GAP_OUTPUT_RANGE),
    }));

    return (
      <Animated.View
        style={[
          style,
          animatedGap,
          {
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}>
        {/* Render the eyebrows */}
        <Animated.View style={animatedEyebrowStyle}>
          <Eyebrow path={eyebrowPath} />
          <Eyebrow path={eyebrowPath} />
        </Animated.View>
        {/* Render the eyes */}
        <Animated.View style={animatedEyeStyle}>
          <Eye progress={progress} />
          <Eye progress={progress} />
        </Animated.View>
        {/* Render the mouth */}
        <Canvas style={MOUTH_CANVAS_SIZE}>
          <Path
            path={mouthPath}
            color="white"
            style="stroke"
            strokeWidth={MOUTH_STROKE_WIDTH}
          />
        </Canvas>
      </Animated.View>
    );
  },
);

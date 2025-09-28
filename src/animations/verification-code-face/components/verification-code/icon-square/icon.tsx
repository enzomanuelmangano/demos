import { type ViewStyle } from 'react-native';

import { forwardRef, useImperativeHandle } from 'react';

import { Canvas, Path } from '@shopify/react-native-skia';
import Animated, {
  interpolate,
  useAnimatedStyle,
} from 'react-native-reanimated';

import { Eye } from './eye';
import { useIconPaths } from './useIconPaths';

import type { SkPath } from '@shopify/react-native-skia';
import type { AnimatedStyle, SharedValue } from 'react-native-reanimated';

type InternalIconProps = {
  style: AnimatedStyle<ViewStyle>;
  progress: SharedValue<number>;
};

export type InternalIconRef = {
  happy: () => void;
  sad: () => void;
  normal: () => void;
};

const EYEBROW_CANVAS_SIZE = { width: 15, height: 5 };
const EYEBROW_STROKE_WIDTH = 0.5;
const MOUTH_CANVAS_SIZE = { width: 25, height: 20 };
const MOUTH_STROKE_WIDTH = 2;
const PROGRESS_INPUT_RANGE = [0, 1];
const GAP_OUTPUT_RANGE = [7, 3];

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

export const InternalIcon = forwardRef<InternalIconRef, InternalIconProps>(
  ({ style, progress }, ref) => {
    const { mouthPath, eyebrowPath, happy, sad, normal } = useIconPaths();

    useImperativeHandle(ref, () => ({
      happy,
      sad,
      normal,
    }));

    const animatedGap = useAnimatedStyle(() => ({
      gap: interpolate(progress.value, PROGRESS_INPUT_RANGE, GAP_OUTPUT_RANGE),
    }));

    const animatedEyebrowStyle = useAnimatedStyle(() => ({
      flexDirection: 'row' as const,
      gap: interpolate(progress.value, PROGRESS_INPUT_RANGE, GAP_OUTPUT_RANGE),
      marginBottom: interpolate(
        progress.value,
        PROGRESS_INPUT_RANGE,
        GAP_OUTPUT_RANGE,
      ),
    }));

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
        <Animated.View style={animatedEyebrowStyle}>
          <Eyebrow path={eyebrowPath} />
          <Eyebrow path={eyebrowPath} />
        </Animated.View>
        <Animated.View style={animatedEyeStyle}>
          <Eye progress={progress} />
          <Eye progress={progress} />
        </Animated.View>
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

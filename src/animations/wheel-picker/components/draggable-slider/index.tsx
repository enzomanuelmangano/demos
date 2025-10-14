import { View } from 'react-native';

import { useMemo } from 'react';

import { Canvas, Path } from '@shopify/react-native-skia';
import Color from 'color';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  clamp,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BoundaryGradient } from './boundary-gradient';
import { ScreenWidth } from './constants';
import { getLinesPath } from './utils/get-lines-path';
import { snapPoint } from './utils/snap-point';
import { unwrapReanimatedValue } from './utils/unwrap-reanimated-value';

import type { SharedValue } from 'react-native-reanimated';

type DraggableSliderProps = {
  // Total number of lines in the slider
  linesAmount: number;
  // Amount of space between each line
  spacePerLine: SharedValue<number> | number;
  // Maximum height of a line
  maxLineHeight: number;
  // Minimum height of a line
  minLineHeight: number;
  // Optional: Offset for determining big lines, defaults to 10
  // That means that every 10th line will be a big line
  bigLineIndexOffset?: number;
  // Optional: The width of each line, defaults to 1.5
  lineWidth?: number;
  // Height of the scrollable area
  // You may want to set this to increase the touchable area
  scrollableAreaHeight: number;
  // Optional: Indicates how frequently snapping should occur, defaults to 1
  // This is very similar to the snapToInterval prop in ScrollView
  // But it refers to lines instead of pixels
  // Try to set it to 5 to see the difference
  snapEach?: number;
  // Optional: Callback function called when the progress changes
  onProgressChange?: (progress: number) => void;
  // Optional: Shared value representing the color of the indicator line
  indicatorColor?: SharedValue<string>;
  // Optional: Indicates whether to show a boundary gradient, defaults to true
  showBoundaryGradient?: boolean;
  // Optional: The color of the lines (default is #c6c6c6)
  lineColor?: string;
  // Optional: The color of the big lines (default is #c6c6c6)
  bigLineColor?: string;
};

export const DraggableSlider: React.FC<DraggableSliderProps> = ({
  linesAmount,
  spacePerLine: spacePerLineProp,
  maxLineHeight,
  minLineHeight,
  bigLineIndexOffset = 10,
  lineWidth = 1.5,
  scrollableAreaHeight,
  onProgressChange,
  snapEach = 1,
  indicatorColor,
  showBoundaryGradient = true,
  lineColor = '#c6c6c6',
  bigLineColor = '#c6c6c6',
}) => {
  const scrollContext = useSharedValue(0);
  const scrollOffset = useSharedValue(ScreenWidth / 2);
  const clampedScrollOffset = useSharedValue(ScreenWidth / 2);

  const spacePerLine = useDerivedValue(() => {
    return unwrapReanimatedValue(spacePerLineProp);
  }, [spacePerLineProp]);

  const progressWidth = useDerivedValue(() => {
    return Math.round(linesAmount * spacePerLine.value);
  }, [linesAmount, spacePerLine]);

  const linesArray = useMemo(() => {
    return new Array(Math.round(linesAmount / snapEach) + 1).fill(0);
  }, [linesAmount, snapEach]);

  const spacings = useDerivedValue(() => {
    return linesArray.map(
      (_, i) => ScreenWidth / 2 - i * spacePerLine.value * snapEach,
    );
  }, [linesArray, snapEach, spacePerLine]);

  useAnimatedReaction(
    () => clampedScrollOffset.value,
    (offset, prev) => {
      if (prev === null) return;
      const progress = interpolate(
        offset,
        [ScreenWidth / 2, -progressWidth.value + ScreenWidth / 2],
        [0, 1],
      );
      if (onProgressChange) onProgressChange(progress);
    },
  );

  const gesture = Gesture.Pan()
    .onBegin(() => {
      scrollContext.value = scrollOffset.value;
      cancelAnimation(scrollOffset);
    })
    .onUpdate(event => {
      scrollOffset.value = clamp(
        scrollContext.value + event.translationX,
        -progressWidth.value + ScreenWidth / 2,
        ScreenWidth / 2,
      );
      clampedScrollOffset.value = scrollOffset.value;
    })
    .onEnd(event => {
      scrollOffset.value = withSpring(
        snapPoint(scrollOffset.value, event.velocityX, spacings.value),
        {
          mass: 0.45,
        },
      );
      clampedScrollOffset.value = withTiming(
        snapPoint(clampedScrollOffset.value, event.velocityX, spacings.value),
        {
          duration: 50,
        },
      );
      // If you don't like snapping, you can use decay animation instead
      // I personally prefer snapping for this use case but this is also an option
      // scrollOffset.value = withDecay({
      //   velocity: event.velocityX,
      //   clamp: [ScreenWidth / 2 - ProgressWidth, ScreenWidth / 2],
      // });
    });

  useAnimatedReaction(
    () => {
      return spacePerLine.value;
    },
    (curr, prev) => {
      if (curr !== prev) {
        scrollOffset.value = withTiming(
          snapPoint(clampedScrollOffset.value, 10, spacings.value),
        );
        clampedScrollOffset.value = withTiming(
          snapPoint(clampedScrollOffset.value, 10, spacings.value),
        );
      }
    },
  );

  const bigLinesPath = useDerivedValue(() => {
    return getLinesPath({
      linesAmount,
      spacePerLine: spacePerLine.value,
      maxLineHeight,
      minLineHeight,
      type: 'bigLines',
      bigLineEach: bigLineIndexOffset,
      scrollOffset: scrollOffset,
    });
  }, []);

  const smallLinesPath = useDerivedValue(() => {
    return getLinesPath({
      linesAmount,
      spacePerLine: spacePerLine.value,
      maxLineHeight,
      minLineHeight,
      type: 'smallLines',
      bigLineEach: bigLineIndexOffset,
      scrollOffset: scrollOffset,
    });
  }, []);

  const indicatorLineWidth = lineWidth * 1.4;
  const indicatorLineHeight = maxLineHeight * 1.5;

  const rIndicatorStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: indicatorColor?.value ?? 'orange',
    };
  }, []);

  return (
    <View>
      <GestureDetector gesture={gesture}>
        <Animated.View
          style={{
            height: scrollableAreaHeight,
          }}>
          <Animated.View
            style={{
              width: ScreenWidth,
              paddingTop: scrollableAreaHeight / 2 - maxLineHeight / 2,
              overflow: 'visible',
            }}>
            <Canvas
              style={{
                width: ScreenWidth,
                height: maxLineHeight,
              }}>
              {/* 
                  We're rendering big and small lines into different paths 
                  Just because we want to render them with different opacities / colors
                  I'm not sure if this can be optimized further
              */}
              {/* Rendering small lines */}
              <Path path={smallLinesPath} color={lineColor} />
              {/* Rendering big lines */}
              <Path path={bigLinesPath} color={bigLineColor} />
              {/* Rendering boundary gradient if enabled */}
              {showBoundaryGradient && (
                <BoundaryGradient
                  x={0}
                  y={0}
                  height={maxLineHeight}
                  width={ScreenWidth}
                  mainColor={
                    !Color(lineColor).isLight() ? '#000000' : '#ffffff'
                  }
                />
              )}
            </Canvas>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      <Animated.View
        pointerEvents="none"
        style={[
          {
            width: indicatorLineWidth,
            height: indicatorLineHeight,
            position: 'absolute',
            left: ScreenWidth / 2,
            borderRadius: 10,
            top: scrollableAreaHeight / 2 - indicatorLineHeight / 2,
            borderCurve: 'continuous',
          },
          rIndicatorStyle,
        ]}
      />
    </View>
  );
};

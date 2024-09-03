// Importing necessary modules and components
import { Canvas, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import type { SharedValue } from 'react-native-reanimated';
import Animated, {
  cancelAnimation,
  clamp,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useMemo } from 'react';

// Importing utility functions and components
import { getLinesPath } from './utils/get-lines-path';
import { ScreenWidth } from './constants';
import { snapPoint } from './utils/snap-point';
import { BoundaryGradient } from './boundary-gradient';

// Defining type for props
type DraggableSliderProps = {
  // Total number of lines in the slider
  linesAmount: number;
  // Amount of space between each line
  spacePerLine: number;
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
};

// DraggableSlider component
export const DraggableSlider: React.FC<DraggableSliderProps> = ({
  linesAmount,
  spacePerLine,
  maxLineHeight,
  minLineHeight,
  bigLineIndexOffset = 10,
  lineWidth = 1.5,
  scrollableAreaHeight,
  onProgressChange,
  snapEach = 1,
  indicatorColor,
  showBoundaryGradient = true,
}) => {
  // Shared value for scroll context
  const scrollContext = useSharedValue(0);
  // Shared value for scroll offset
  const scrollOffset = useSharedValue(ScreenWidth / 2);

  // Calculating total width of the progress bar
  const ProgressWidth = Math.round(linesAmount * spacePerLine);

  // Memoizing spacings for snapping
  // This is used to determine the snap points for the spring animation
  // when the user releases the slider
  const spacings = useMemo(
    () =>
      new Array(Math.round(linesAmount / snapEach) + 1)
        .fill(0)
        .map((_, i) => ScreenWidth / 2 - i * spacePerLine * snapEach),
    [linesAmount, snapEach, spacePerLine],
  );

  // Reactions to scroll offset changes
  useAnimatedReaction(
    () => scrollOffset.value,
    offset => {
      // Interpolating progress based on scroll offset
      const progress = interpolate(
        offset,
        [ScreenWidth / 2, -ProgressWidth + ScreenWidth / 2],
        [0, 1],
      );
      // Calling the progress change callback if provided
      if (onProgressChange) onProgressChange(progress);
    },
  );

  // Gesture handler for panning
  const gesture = Gesture.Pan()
    .onBegin(() => {
      // Storing current scroll offset
      scrollContext.value = scrollOffset.value;
      // Cancelling any ongoing animations
      cancelAnimation(scrollOffset);
    })
    .onUpdate(event => {
      // Updating scroll offset based on pan gesture
      scrollOffset.value = clamp(
        scrollContext.value + event.translationX,
        -ProgressWidth + ScreenWidth / 2,
        ScreenWidth / 2,
      );
    })
    .onEnd(event => {
      // Applying spring animation for snapping
      scrollOffset.value = withSpring(
        snapPoint(scrollOffset.value, event.velocityX, spacings),
        {
          mass: 0.45,
        },
      );
      // If you don't like snapping, you can use decay animation instead
      // I personally prefer snapping for this use case but this is also an option
      // scrollOffset.value = withDecay({
      //   velocity: event.velocityX,
      //   clamp: [ScreenWidth / 2 - ProgressWidth, ScreenWidth / 2],
      // });
    });

  // Derived value for big lines path
  const bigLinesPath = useDerivedValue(() => {
    return getLinesPath({
      linesAmount,
      spacePerLine,
      maxLineHeight,
      minLineHeight,
      type: 'bigLines',
      bigLineEach: bigLineIndexOffset,
      scrollOffset: scrollOffset,
    });
  }, []);

  // Derived value for small lines path
  const smallLinesPath = useDerivedValue(() => {
    return getLinesPath({
      linesAmount,
      spacePerLine,
      maxLineHeight,
      minLineHeight,
      type: 'smallLines',
      bigLineEach: bigLineIndexOffset,
      scrollOffset: scrollOffset,
    });
  }, []);

  // Calculating dimensions for indicator line
  const indicatorLineWidth = lineWidth * 1.4;
  const indicatorLineHeight = maxLineHeight * 1.5;

  // Animated style for indicator line
  const rIndicatorStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: indicatorColor?.value ?? 'orange',
    };
  }, []);

  // Rendering draggable slider component
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
              <Path path={smallLinesPath} color={'white'} opacity={0.5} />
              {/* Rendering big lines */}
              <Path path={bigLinesPath} color={'white'} />
              {/* Rendering boundary gradient if enabled */}
              {showBoundaryGradient && (
                <BoundaryGradient
                  x={0}
                  y={0}
                  height={maxLineHeight}
                  width={ScreenWidth}
                  mainColor="#000"
                />
              )}
            </Canvas>
          </Animated.View>
        </Animated.View>
      </GestureDetector>

      {/* Rendering indicator line */}
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
          },
          rIndicatorStyle,
        ]}
      />
    </View>
  );
};

import React, { useImperativeHandle } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withDecay,
  withTiming,
} from 'react-native-reanimated';

import { useTimer } from './hooks/useTimer';
import type { DraggableSliderProps } from './types';
import { TickLine } from './components/tick-line';

const { height: WindowHeight } = Dimensions.get('window');
const radius = 280;

export type CircularDraggableSliderRefType = {
  resetTimer: () => void;
  runTimer: (to: number) => void;
  stopTimer: () => void;
};

// This one was really challening :)
// The idea is to use a custom pan gesture handler to handle the drag event and update the progress value accordingly.
// Once the user drags, the progress gets converted to radians and then to seconds.

// To map the translation to an angle I've used the interpolate function.
// Here's the idea.
// Let's imagine that you don't see a circle but a straight line | | | | | | | | | | |
// What's the distance between two ticks? It's the straight line length divided by the amount of ticks.
// But actually the straight line length is our diameter of the circle, so it's 2 * PI * radius.
// const distanceBetweenTwoTicks = diameter / linesAmount; -> 2 * PI * radius / linesAmount

// Once we have this knowledge we can remap the progress value to radians.
// ->
// inputRange: [0, listWidth]
// outputRange: [0, 2 * Math.PI]
// I have added an offset in the actual code to rotate the circle by 90 degrees at the very beginning

export const CircularDraggableSlider = React.forwardRef<
  CircularDraggableSliderRefType,
  DraggableSliderProps
>(
  (
    {
      linesAmount,
      maxLineHeight,
      minLineHeight,
      bigLineIndexOffset = 10,
      lineWidth = 1.5,
      onProgressChange,
      indicatorColor,
      lineColor = '#c6c6c6',
      bigLineColor = '#c6c6c6',
      onCompletion,
    },
    ref,
  ) => {
    const progress = useSharedValue(0);
    const previousProgress = useSharedValue(0);

    const distanceBetweenTwoTicksRad = (2 * Math.PI) / linesAmount;
    const diameter = 2 * Math.PI * radius;
    const distanceBetweenTwoTicks = diameter / linesAmount;
    const listWidth = diameter;

    const { runTimer, stopTimer, resetTimer, isTimerEnabled } = useTimer({
      progress,
      incrementOffset: distanceBetweenTwoTicks,
      onCompletion: () => {
        isTimerEnabled.value = false;
        onCompletion?.();
      },
    });

    useImperativeHandle(ref, () => {
      return {
        resetTimer,
        runTimer,
        stopTimer,
      };
    }, [resetTimer, runTimer, stopTimer]);

    const panGesture = Gesture.Pan()
      .onBegin(() => {
        if (isTimerEnabled.value) {
          return;
        }
        cancelAnimation(progress);
        previousProgress.value = progress.value;
      })
      .onUpdate(event => {
        if (isTimerEnabled.value) {
          return;
        }
        progress.value = event.translationX + previousProgress.value;
      })
      .onFinalize(event => {
        if (isTimerEnabled.value) {
          return;
        }
        if (progress.value > 0) {
          cancelAnimation(progress);
          progress.value = withTiming(0, { duration: 500 });
          return;
        }
        progress.value = withDecay({
          velocity: event.velocityX,
        });
      });

    const offset = Math.PI / 2;
    const progressRadiants = useDerivedValue(() => {
      return interpolate(
        -progress.value,
        [0, listWidth],
        [offset, 2 * Math.PI + offset],
      );
    }, [listWidth]);

    useAnimatedReaction(
      () => progressRadiants.value,
      radiants => {
        const amountOfSeconds = Math.round(
          (radiants - offset) / distanceBetweenTwoTicksRad,
        );
        if (onProgressChange) {
          onProgressChange(amountOfSeconds);
        }
      },
    );

    return (
      <View style={styles.container}>
        <View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              justifyContent: 'center',
              alignItems: 'center',
              height: radius * 2,
              width: radius * 2,
              transform: [
                {
                  translateY: WindowHeight / 2 - radius / 2,
                },
              ],
            },
          ]}>
          <View
            style={{
              position: 'absolute',
              top: -maxLineHeight / 2,
              zIndex: 10,
              height: maxLineHeight * 1.2,
              width: lineWidth * 2,
              backgroundColor: indicatorColor,
            }}
          />
          <Animated.View pointerEvents="none">
            {new Array(linesAmount).fill(0).map((_, index) => {
              const isBigLine = index % bigLineIndexOffset === 0;
              const height = isBigLine ? maxLineHeight : minLineHeight;
              const color = isBigLine ? bigLineColor : lineColor;

              return (
                <TickLine
                  disabled={isTimerEnabled}
                  key={index}
                  height={height}
                  radius={radius}
                  progressRadiants={progressRadiants}
                  index={index}
                  lineWidth={lineWidth}
                  color={color}
                  linesAmount={linesAmount}
                />
              );
            })}
          </Animated.View>
        </View>
        <GestureDetector gesture={panGesture}>
          <Animated.View
            style={[
              {
                height: WindowHeight / 2,
              },
              styles.timer,
            ]}
          />
        </GestureDetector>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  timer: {
    position: 'absolute',
    bottom: 0,
    width: '100%',
  },
});

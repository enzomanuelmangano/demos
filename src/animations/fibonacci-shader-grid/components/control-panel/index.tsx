import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolate,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type ControlPanelProps = {
  x: Animated.SharedValue<number>;
  y: Animated.SharedValue<number>;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
};

const BUTTON_RADIUS = 24;

export const ControlPanel: React.FC<ControlPanelProps> = ({
  x,
  y,
  minX,
  maxX,
  minY,
  maxY,
  width,
  height,
}) => {
  // Function to remap x-coordinate from screen width (0 to width) to a specified range [minX, maxX].
  const remapXcoord = useCallback(
    (xCoord: number) => {
      'worklet';
      // Using linear interpolation to map x-coordinate from screen width to the specified range.
      return interpolate(xCoord, [0, width], [minX, maxX], Extrapolate.CLAMP);
    },
    [maxX, minX, width],
  );

  // Function to remap y-coordinate from screen height (0 to height) to a specified range [minY, maxY].
  const remapYcoord = useCallback(
    (yCoord: number) => {
      'worklet';
      // Using linear interpolation to map y-coordinate from screen height to the specified range.
      return interpolate(yCoord, [0, height], [minY, maxY], Extrapolate.CLAMP);
    },
    [height, maxY, minY],
  );

  // Function to map x-coordinate from a specified range [minX, maxX] to screen width.
  const mapXvalue = useCallback(
    (xCoord: number) => {
      'worklet';
      // Using linear interpolation to map x-coordinate from the specified range to screen width.
      return interpolate(xCoord, [minX, maxX], [0, width], Extrapolate.CLAMP);
    },
    [maxX, minX, width],
  );

  // Function to map y-coordinate from a specified range [minY, maxY] to screen height.
  const mapYvalue = useCallback(
    (yCoord: number) => {
      'worklet';
      // Using linear interpolation to map y-coordinate from the specified range to screen height.
      return interpolate(yCoord, [minY, maxY], [0, height], Extrapolate.CLAMP);
    },
    [height, maxY, minY],
  );

  // Shared state variable to track whether a pan gesture is currently active.
  const isActive = useSharedValue(false);

  // Gesture handler for panning.
  const gesture = Gesture.Pan()
    .onBegin(event => {
      // Set isActive to true when the pan gesture begins.
      isActive.value = true;

      // Interpolate and animate x, y coordinates on gesture start.
      const interpolatedX = remapXcoord(event.x);
      const interpolatedY = remapYcoord(event.y);

      // Use spring animation to smoothly transition to the new interpolated coordinates.
      x.value = withSpring(interpolatedX, {
        mass: 0.5, // Mass parameter for spring animation.
      });
      y.value = withSpring(interpolatedY, {
        mass: 0.5, // Mass parameter for spring animation.
      });
    })
    .onUpdate(event => {
      // Interpolate and update x, y coordinates during the pan gesture.
      const interpolatedX = remapXcoord(event.x);
      const interpolatedY = remapYcoord(event.y);

      // Update the animated values with the newly interpolated coordinates.
      x.value = interpolatedX;
      y.value = interpolatedY;
    })
    .onFinalize(() => {
      // Set isActive to false when the pan gesture ends.
      isActive.value = false;
    });

  // Animated style for a pointer, including opacity, translation, and scaling animations.
  const rPointerStyle = useAnimatedStyle(() => {
    // Calculate translated x, y coordinates for the pointer animation.
    const translateX = mapXvalue(x.value) - BUTTON_RADIUS;
    const translateY = mapYvalue(y.value) - BUTTON_RADIUS;

    return {
      // Animate opacity based on whether the pan gesture is active.
      opacity: withTiming(isActive.value ? 0.6 : 1),
      transform: [
        {
          // Translate animation for x-coordinate.
          translateX,
        },
        {
          // Translate animation for y-coordinate.
          translateY,
        },
        {
          // Scale animation based on whether the pan gesture is active.
          scale: withSpring(isActive.value ? 1.2 : 1),
        },
      ],
    };
  }, [height, maxX, maxY, minX, minY, width, x, y]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          {
            width,
            height,
          },
          styles.container,
        ]}>
        <Animated.View style={[styles.pointer, rPointerStyle]} />
        <View
          style={{
            width,
            height,
            flexWrap: 'wrap',
            flexDirection: 'row',
            overflow: 'hidden',
          }}>
          {new Array(36).fill(0).map((_, i) => {
            return (
              <View
                key={i}
                style={[
                  {
                    height: height / 6 - 0.7,
                    width: height / 6 - 0.7,
                  },
                  styles.gridItem,
                ]}
              />
            );
          })}
          <View
            style={[
              {
                height: height,
                left: width / 2 - 1,
                width: 2,
                top: -2,
              },
              styles.line,
            ]}
          />
          <View
            style={[
              {
                width: width - 1,
                top: height / 2 - 1,
                left: -1,
                height: 2,
              },
              styles.line,
            ]}
          />
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: BUTTON_RADIUS,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    flexWrap: 'wrap',
    flexDirection: 'row',
    overflow: 'visible',
  },
  pointer: {
    position: 'absolute',
    aspectRatio: 1,
    backgroundColor: 'white',
    height: BUTTON_RADIUS * 2,
    borderRadius: BUTTON_RADIUS,
  },
  gridItem: {
    overflow: 'hidden',
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
  },
  line: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.8)',
    zIndex: 10,
  },
});

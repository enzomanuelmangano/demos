import { StyleSheet, View } from 'react-native';

import { useCallback } from 'react';

import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

type ControlPanelProps = {
  x: SharedValue<number>;
  y: SharedValue<number>;
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
  const remapXcoord = useCallback(
    (xCoord: number) => {
      'worklet';
      return interpolate(xCoord, [0, width], [minX, maxX], Extrapolation.CLAMP);
    },
    [maxX, minX, width],
  );

  const remapYcoord = useCallback(
    (yCoord: number) => {
      'worklet';
      return interpolate(
        yCoord,
        [0, height],
        [minY, maxY],
        Extrapolation.CLAMP,
      );
    },
    [height, maxY, minY],
  );

  const mapXvalue = useCallback(
    (xCoord: number) => {
      'worklet';
      return interpolate(xCoord, [minX, maxX], [0, width], Extrapolation.CLAMP);
    },
    [maxX, minX, width],
  );

  const mapYvalue = useCallback(
    (yCoord: number) => {
      'worklet';
      return interpolate(
        yCoord,
        [minY, maxY],
        [0, height],
        Extrapolation.CLAMP,
      );
    },
    [height, maxY, minY],
  );

  const isActive = useSharedValue(false);

  const gesture = Gesture.Pan()
    .onBegin(event => {
      isActive.value = true;

      const interpolatedX = remapXcoord(event.x);
      const interpolatedY = remapYcoord(event.y);

      x.value = withSpring(interpolatedX, {
        mass: 0.5,
      });
      y.value = withSpring(interpolatedY, {
        mass: 0.5,
      });
    })
    .onUpdate(event => {
      const interpolatedX = remapXcoord(event.x);
      const interpolatedY = remapYcoord(event.y);

      x.value = interpolatedX;
      y.value = interpolatedY;
    })
    .onFinalize(() => {
      isActive.value = false;
    });

  const rPointerStyle = useAnimatedStyle(() => {
    const translateX = mapXvalue(x.value) - BUTTON_RADIUS;
    const translateY = mapYvalue(y.value) - BUTTON_RADIUS;

    return {
      opacity: withTiming(isActive.value ? 0.6 : 1),
      transform: [
        {
          translateX,
        },
        {
          translateY,
        },
        {
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
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: BUTTON_RADIUS,
    borderWidth: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'visible',
  },
  gridItem: {
    borderColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    overflow: 'hidden',
  },
  line: {
    backgroundColor: 'rgba(255,255,255,0.8)',
    position: 'absolute',
    zIndex: 10,
  },
  pointer: {
    aspectRatio: 1,
    backgroundColor: 'white',
    borderRadius: BUTTON_RADIUS,
    height: BUTTON_RADIUS * 2,
    position: 'absolute',
  },
});

import { MaterialIcons } from '@expo/vector-icons';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';
import { useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import type { FourierVisualizerRefType } from './components/fourier-visualizer';
import { FourierVisualizer } from './components/fourier-visualizer';

// The main App component.
const App = () => {
  // Shared value to represent the drawn path.
  const drawPath = useSharedValue(Skia.Path.Make());

  // Ref for the FourierVisualizer component.
  const ref = useRef<FourierVisualizerRefType>({
    // Usually it shouldn't be necessary to define the ref type manually.
    // But I was getting this TypeError on Fast Refresh:
    // TypeError: Cannot assign to read-only property 'current', js engine: hermes
    clear: () => {},
    draw: () => {},
  });

  // Opacity value for animation.
  const opacity = useSharedValue(1);

  // Shared value to track if drawing is in progress.
  const isDrawing = useSharedValue(false);

  // Callback to handle the drawing of paths.
  const drawPathWrapper = useCallback(
    (svgString: string) => {
      const newPath = Skia.Path.MakeFromSVGString(svgString)!;
      isDrawing.value = true;
      ref.current?.draw({
        path: newPath,
        onComplete: () => {
          isDrawing.value = false;
        },
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const clear = () => {
    ref.current?.clear();
  };
  const panGesture = Gesture.Pan()
    .onStart(({ x, y }) => {
      scheduleOnRN(clear);
      isDrawing.value = false;
      drawPath.value.reset();
      opacity.value = withTiming(1);
      drawPath.value.moveTo(x, y);
      drawPath.value.lineTo(x, y);
      drawPath.value = Skia.Path.MakeFromSVGString(
        drawPath.value.toSVGString(),
      )!;
    })
    .onChange(({ x, y }) => {
      drawPath.value.lineTo(x, y);
      drawPath.value = Skia.Path.MakeFromSVGString(
        drawPath.value.toSVGString(),
      )!;
    })
    .onEnd(() => {
      opacity.value = withTiming(0);
      const svgString = drawPath.value.toSVGString();
      scheduleOnRN(drawPathWrapper, svgString);
    });

  const rClearButton = useAnimatedStyle(() => {
    return {
      opacity: withTiming(isDrawing.value ? 1 : 0),
      bottom: withSpring(isDrawing.value ? 65 : 0),
    };
  });

  return (
    <>
      <GestureDetector gesture={panGesture}>
        <Animated.View style={styles.container}>
          <Canvas style={styles.canvas}>
            <Path
              path={drawPath}
              strokeWidth={10}
              style={'stroke'}
              opacity={opacity}
            />
            <FourierVisualizer
              ref={value => {
                // eslint-disable-next-line @typescript-eslint/ban-ts-comment
                // @ts-expect-error
                ref.current = value;
              }}
              strokeWidth={5}
            />
          </Canvas>
        </Animated.View>
      </GestureDetector>
      <PressableScale
        style={[styles.clearButton, rClearButton]}
        onPress={() => {
          isDrawing.value = false;
          ref.current?.clear();
        }}>
        <MaterialIcons name="clear" size={24} color="white" />
      </PressableScale>
    </>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  canvas: { flex: 1, backgroundColor: '#D4D4D4' },
  clearButton: {
    position: 'absolute',
    bottom: 100,
    height: 64,
    aspectRatio: 1,
    backgroundColor: '#111',
    right: 30,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { App as FourierVisualizer };

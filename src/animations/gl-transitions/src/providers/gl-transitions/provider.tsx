import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import {
  Canvas,
  Fill,
  ImageShader,
  makeImageFromView,
  Shader,
} from 'react-native-skia';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { transition } from './utils/transition';

import type { WithTimingConfig } from 'react-native-reanimated';
import type { SkImage } from 'react-native-skia';

type GLTransitionsProviderProps = {
  children?: ReactNode;
  transition: string;
};

type GLTransitionsContextType = {
  prepareTransition: () => Promise<void>;
  runTransition: (
    _?: WithTimingConfig,
    onCompleted?: () => void,
  ) => Promise<void>;
};

// Create a context for GL transitions with default values
export const GLTransitionsContext = createContext<GLTransitionsContextType>({
  prepareTransition: async () => {},
  runTransition: async (_?: WithTimingConfig, __?: () => void) => {},
});

// This code seems quite complex, but it really isn't.
// It's just a provider that wraps the GLTransitionsContext.
// The idea here is that you can wrap your entire app with this provider
// and use the GLTransitionsContext to prepare and run transitions.

// The prepareTransition method is used:
// - to take a snapshot of the current screen
// - to set the progress to 0 (just in case it's not already)

// The runTransition method is used:
// - to take a snapshot of the next screen
// - to run the transition

/**
 * Runs `callback` on the JS thread once the UI thread has applied every shared
 * value set before this call. A snapshot is a full-screen texture; disposing it
 * any earlier could let a frame still draw it after it was released.
 */
const afterUIUpdate = (callback: () => void) => {
  scheduleOnUI(() => {
    'worklet';
    scheduleOnRN(callback);
  });
};

// GLTransitionsProvider component
export const GLTransitionsProvider: FC<GLTransitionsProviderProps> = ({
  children,
  transition: glTransition,
}) => {
  // Shared values for progress and screen snapshots
  const progress = useSharedValue(0);
  const firstScreenSnapshot = useSharedValue<SkImage | null>(null);
  const secondScreenSnapshot = useSharedValue<SkImage | null>(null);

  // Ref for container
  const containerRef = useRef<View>(null);

  // The snapshots this provider still owns, so each one is disposed exactly
  // once: when its transition ends, when a newer snapshot replaces it, or on
  // unmount. Left to the garbage collector, every transition kept two
  // full-screen textures alive.
  const snapshotsRef = useRef<{
    first: SkImage | null;
    second: SkImage | null;
    unmounted: boolean;
  }>({ first: null, second: null, unmounted: false });

  useEffect(() => {
    const snapshots = snapshotsRef.current;
    snapshots.unmounted = false;
    return () => {
      snapshots.unmounted = true;
      const { first, second } = snapshots;
      snapshots.first = null;
      snapshots.second = null;
      // The canvas may not have heard of the unmount yet on the UI thread.
      firstScreenSnapshot.set(null);
      secondScreenSnapshot.set(null);
      afterUIUpdate(() => {
        first?.dispose();
        second?.dispose();
      });
    };
  }, [firstScreenSnapshot, secondScreenSnapshot]);

  // Callback to prepare transition
  const prepareTransition = useCallback(async () => {
    // Capture the current screen as a snapshot
    const image = await makeImageFromView(containerRef);
    const snapshots = snapshotsRef.current;
    if (snapshots.unmounted) {
      image?.dispose();
      return;
    }
    const previous = snapshots.first;
    snapshots.first = image;
    firstScreenSnapshot.set(image);
    // Reset the transition progress to 0
    progress.set(0);
    if (previous) afterUIUpdate(() => previous.dispose());
  }, [firstScreenSnapshot, progress]);

  // Callback to run transition
  const runTransition = useCallback(
    async (timingConfig?: WithTimingConfig, onCompleted?: () => void) => {
      // Capture the next screen as a snapshot
      const image = await makeImageFromView(containerRef);
      const snapshots = snapshotsRef.current;
      if (snapshots.unmounted) {
        image?.dispose();
        return;
      }
      const previous = snapshots.second;
      snapshots.second = image;
      secondScreenSnapshot.set(image);
      if (previous) afterUIUpdate(() => previous.dispose());

      // Released only if nothing newer has taken their place since.
      const first = snapshots.first;
      const releaseSnapshots = () => {
        if (snapshots.first === first) {
          snapshots.first = null;
          first?.dispose();
        }
        if (snapshots.second === image) {
          snapshots.second = null;
          image?.dispose();
        }
      };

      // Start the transition animation
      progress.set(
        withTiming(1, timingConfig, isFinished => {
          if (isFinished) {
            // Reset all values after the transition completes
            firstScreenSnapshot.set(null);
            secondScreenSnapshot.set(null);
            progress.set(0);
            // Set to null on this thread above, so no later frame draws them.
            scheduleOnRN(releaseSnapshots);
            if (onCompleted) scheduleOnRN(onCompleted);
          }
        }),
      );
    },
    [firstScreenSnapshot, progress, secondScreenSnapshot],
  );

  const contextValue = useMemo(() => {
    return {
      prepareTransition,
      runTransition,
    };
  }, [prepareTransition, runTransition]);

  const rCanvasStyle = useAnimatedStyle(() => {
    return {
      zIndex: progress.get() === 0 ? -10 : 10,
      pointerEvents: progress.get() === 0 ? 'none' : 'auto',
    };
  }, []);

  const source = useMemo(() => {
    return transition(glTransition);
  }, [glTransition]);

  const { width, height } = useWindowDimensions();

  const uniforms = useDerivedValue(() => {
    return {
      progress: progress.get(),
      resolution: [width, height],
    };
  }, [width, height]);

  // Render GLTransitionsProvider
  return (
    <GLTransitionsContext.Provider value={contextValue}>
      <View ref={containerRef} collapsable={false} style={styles.fill}>
        {/* Animated canvas for transitioning */}
        <Animated.View style={[StyleSheet.absoluteFill, rCanvasStyle]}>
          <Canvas style={styles.fill}>
            <Fill>
              {/* Apply shader with transition effect */}
              <Shader source={source} uniforms={uniforms}>
                {/* Render snapshots of current and next screens */}
                <ImageShader
                  image={secondScreenSnapshot}
                  fit="cover"
                  width={width}
                  height={height}
                />
                <ImageShader
                  image={firstScreenSnapshot}
                  fit="cover"
                  width={width}
                  height={height}
                />
              </Shader>
            </Fill>
          </Canvas>
        </Animated.View>
        {/* Render child components */}
        {children}
      </View>
    </GLTransitionsContext.Provider>
  );
};

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
});

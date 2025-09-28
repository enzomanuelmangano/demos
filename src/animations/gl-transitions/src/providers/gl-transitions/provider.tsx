import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  createContext,
  type FC,
  type ReactNode,
  useCallback,
  useMemo,
  useRef,
} from 'react';

import {
  Canvas,
  Fill,
  ImageShader,
  makeImageFromView,
  Shader,
} from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { transition } from './utils/transition';

import type { SkImage } from '@shopify/react-native-skia';
import type { WithTimingConfig } from 'react-native-reanimated';

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

  // Callback to prepare transition
  const prepareTransition = useCallback(async () => {
    // Capture the current screen as a snapshot
    firstScreenSnapshot.value = await makeImageFromView(containerRef);
    // Reset the transition progress to 0
    progress.value = 0;
  }, [firstScreenSnapshot, progress]);

  // Callback to run transition
  const runTransition = useCallback(
    async (timingConfig?: WithTimingConfig, onCompleted?: () => void) => {
      // Capture the next screen as a snapshot
      secondScreenSnapshot.value = await makeImageFromView(containerRef);
      // Start the transition animation
      progress.value = withTiming(1, timingConfig, isFinished => {
        if (isFinished) {
          // Reset all values after the transition completes
          firstScreenSnapshot.value = null;
          secondScreenSnapshot.value = null;
          progress.value = 0;
          if (onCompleted) scheduleOnRN(onCompleted);
        }
      });
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
      zIndex: progress.value === 0 ? -10 : 10,
      pointerEvents: progress.value === 0 ? 'none' : 'auto',
    };
  }, []);

  const source = useMemo(() => {
    return transition(glTransition);
  }, [glTransition]);

  const { width, height } = useWindowDimensions();

  const uniforms = useDerivedValue(() => {
    return {
      progress: progress.value,
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

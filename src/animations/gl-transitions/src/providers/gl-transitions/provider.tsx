import type { SkImage } from '@shopify/react-native-skia';
import {
  Canvas,
  Fill,
  ImageShader,
  Shader,
  makeImageFromView,
} from '@shopify/react-native-skia';
import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import type { WithTimingConfig } from 'react-native-reanimated';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { transition } from './utils/transition';

// Define prop types for the GLTransitionsProvider component
type GLTransitionsProviderProps = {
  children?: React.ReactNode;
  transition: string;
};

// Define context type for GLTransitionsContext
type GLTransitionsContextType = {
  prepareTransition: () => Promise<void>;
  runTransition: (
    _?: WithTimingConfig,
    onCompleted?: () => void,
  ) => Promise<void>;
};

// Create a context for GL transitions with default values
export const GLTransitionsContext =
  React.createContext<GLTransitionsContextType>({
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

// Create AnimatedCanvas component
const AnimatedCanvas = Animated.createAnimatedComponent(Canvas);

// GLTransitionsProvider component
export const GLTransitionsProvider: React.FC<GLTransitionsProviderProps> = ({
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
          if (onCompleted) runOnJS(onCompleted)();
        }
      });
    },
    [firstScreenSnapshot, progress, secondScreenSnapshot],
  );

  // Memoized context value
  const contextValue = useMemo(() => {
    return {
      prepareTransition,
      runTransition,
    };
  }, [prepareTransition, runTransition]);

  // Animated style for canvas
  const rCanvasStyle = useAnimatedStyle(() => {
    return {
      // Ensure the canvas is rendered above other elements during transition
      zIndex: progress.value === 0 ? -10 : 10,
      // Disable pointer events during transition to prevent interaction
      pointerEvents: progress.value === 0 ? 'none' : 'auto',
    };
  }, []);

  // Determine shader source based on transition
  const source = useMemo(() => {
    return transition(glTransition);
  }, [glTransition]);

  // Get window dimensions
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
      <View
        ref={containerRef}
        style={{
          flex: 1,
        }}>
        {/* Animated canvas for transitioning */}
        <AnimatedCanvas style={[StyleSheet.absoluteFill, rCanvasStyle]}>
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
        </AnimatedCanvas>
        {/* Render child components */}
        {children}
      </View>
    </GLTransitionsContext.Provider>
  );
};

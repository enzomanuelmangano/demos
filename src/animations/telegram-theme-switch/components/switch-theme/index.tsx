import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useEffect, useMemo, useRef, useState } from 'react';

import Reanimated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  Canvas,
  Group,
  Image,
  Skia,
  makeImageFromView,
} from 'react-native-skia';
import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';

import { AnimatedLottieView } from '../animated-lottie-view';
import { SwitchThemeContext, useSwitchTheme, type Theme } from './context';
import {
  MAX_THEME_ANIMATION_SIZE,
  SwitchThemeButton,
} from './switch-theme-button';

import type { StyleProp, ViewStyle } from 'react-native';
import type { SkImage } from 'react-native-skia';

type SwitchThemeProviderProps = {
  children?: React.ReactNode;
};

export const SWITCH_THEME_ANIMATION_DURATION = 1000;

/**
 * Runs `callback` on the JS thread once the UI thread has applied every shared
 * value set before this call. The snapshot is a full-screen texture; disposing
 * it any earlier could let a frame still draw it after it was released.
 */
const afterUIUpdate = (callback: () => void) => {
  scheduleOnUI(() => {
    'worklet';
    scheduleOnRN(callback);
  });
};

const disposeWhenReady = (snapshot: Promise<SkImage | null>) => {
  snapshot.then(image => image?.dispose()).catch(() => {});
};

const SwitchThemeProvider: React.FC<SwitchThemeProviderProps> = ({
  children,
}) => {
  const [theme, setTheme] = useState<Theme>('dark');
  const animationProgress = useSharedValue(0);

  const center = useSharedValue({
    x: 0,
    y: 0,
    height: 0,
    width: 0,
  });

  const viewRef = useRef<View>(null);
  // Snapshot taken when the finger touches the button (see prepareToggleTheme).
  const pendingSnapshot = useRef<Promise<SkImage | null> | null>(null);

  const switchThemeStyle = useSharedValue({});
  const skImage = useSharedValue<SkImage | null>(null);
  // The snapshot skImage holds, so it can be disposed once the reveal is over.
  // Left to the garbage collector, every toggle kept a full-screen texture.
  const shownImage = useRef<SkImage | null>(null);
  const unmounted = useRef(false);

  useEffect(() => {
    unmounted.current = false;
    return () => {
      unmounted.current = true;
      if (pendingSnapshot.current) disposeWhenReady(pendingSnapshot.current);
      pendingSnapshot.current = null;
      const image = shownImage.current;
      shownImage.current = null;
      // The canvas may not have heard of the unmount yet on the UI thread.
      skImage.set(null);
      if (image) afterUIUpdate(() => image.dispose());
    };
  }, [skImage]);

  const clipPathRadiusScale = useDerivedValue(() => {
    return withSpring(theme === 'light' ? 1 : 0, {
      duration: SWITCH_THEME_ANIMATION_DURATION,
      dampingRatio: 1,
    });
  }, [theme]);

  const isAnimating = useSharedValue(false);
  const invertClip = useSharedValue(false);

  // Using `useMemo` to memoize the value for performance benefits.
  // This value will only be recalculated if any item in the dependency array changes.
  const value = useMemo(() => {
    return {
      // Return the current theme
      theme: theme,

      // Return the animation progress
      animationProgress,

      // Called on touch down. makeImageFromView renders the whole view
      // hierarchy on the main thread (drawViewHierarchyInRect with
      // afterScreenUpdates), which stalls it for several frames. Starting it
      // while the finger is still down keeps that stall out of the reveal,
      // and the screen being captured is the same one toggleTheme would see.
      prepareToggleTheme: () => {
        if (isAnimating.get()) return;
        // A touch that never became a toggle leaves its snapshot unused.
        if (pendingSnapshot.current) disposeWhenReady(pendingSnapshot.current);
        pendingSnapshot.current = makeImageFromView(viewRef);
      },

      cancelToggleTheme: () => {
        if (pendingSnapshot.current) disposeWhenReady(pendingSnapshot.current);
        pendingSnapshot.current = null;
      },

      // Define a function to toggle the theme,
      // which can be triggered by other components or events
      toggleTheme: async ({
        center: toggledItemCenter,
        style: toggledItemStyle,
      }: {
        center: { x: number; y: number; height: number; width: number };
        style: StyleProp<ViewStyle>;
      }) => {
        // If an animation is currently in progress, don't initiate a new one,
        // and drop the snapshot this touch took on the way down
        if (isAnimating.get()) {
          if (pendingSnapshot.current) {
            disposeWhenReady(pendingSnapshot.current);
          }
          pendingSnapshot.current = null;
          return;
        }

        // Indicate that the theme toggle animation is starting
        isAnimating.set(true);

        // Set `invertClip` to true if the current theme is not 'light'
        invertClip.set(theme !== 'light');

        // Create an image representation of the current view (snapshot),
        // reusing the one started on touch down when there is one
        const snapshot = pendingSnapshot.current ?? makeImageFromView(viewRef);
        pendingSnapshot.current = null;
        const image = await snapshot;
        if (unmounted.current) {
          image?.dispose();
          return;
        }
        const previous = shownImage.current;
        shownImage.current = image;
        skImage.set(image);
        if (previous) afterUIUpdate(() => previous.dispose());
        const releaseImage = () => {
          if (shownImage.current !== image) return;
          shownImage.current = null;
          image?.dispose();
        };

        // Update the `center` shared value with the provided center for the toggled item
        center.set({ ...toggledItemCenter });

        // Determine the end value for the animation based on the current theme
        const toValue = theme !== 'light' ? 1 : 0;

        // Toggle the theme state between 'light' and 'dark'
        setTheme(theme === 'light' ? 'dark' : 'light');

        // Set and initiate the animation progress
        animationProgress.set(1 - toValue);
        animationProgress.set(
          withSpring(
            toValue,
            {
              duration: SWITCH_THEME_ANIMATION_DURATION,
              dampingRatio: 1,
            },
            finished => {
              // Reset certain values after the animation is complete
              isAnimating.set(false);
              // Cleared even when interrupted: the reveal is over either way,
              // and a snapshot left here would never be released.
              skImage.set(null);
              // Set to null on this thread above, so no later frame draws it.
              scheduleOnRN(releaseImage);
              if (finished) {
                switchThemeStyle.set({});
              }
            },
          ),
        );

        // Set the style for the theme switch based on the provided style
        switchThemeStyle.set({ ...StyleSheet.flatten(toggledItemStyle) });
      },
    };
    // Dependency array for `useMemo`: Only recalculate the value if any of these values change
  }, [
    center,
    invertClip,
    isAnimating,
    skImage,
    switchThemeStyle,
    theme,
    animationProgress,
  ]);

  const rStyle = useAnimatedStyle(() => {
    return {
      left: center.get().x,
      top: center.get().y,
      width: center.get().width,
      height: center.get().height,
      ...switchThemeStyle.get(),
      backgroundColor: 'transparent',
      opacity: isAnimating.get() ? 1 : 0,
      pointerEvents: 'none',
    };
  }, []);

  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const clipPath = useDerivedValue(() => {
    const yPosition = Math.max(windowHeight - center.get().y, center.get().y);
    const xPosition = Math.max(windowWidth - center.get().x, center.get().x);

    const maxCircleRadius = Math.sqrt(yPosition ** 2 + xPosition ** 2);
    const minCircleRadius = 2;

    const builder = Skia.PathBuilder.Make();

    builder.addCircle(
      center.get().x + center.get().width / 2,
      center.get().y + center.get().height / 2,
      interpolate(
        clipPathRadiusScale.get(),
        [0, 0.9],
        [minCircleRadius, maxCircleRadius],
      ),
    );
    return builder.build();
  }, [center]);

  const animatedProps = useAnimatedProps(() => {
    return {
      progress: animationProgress.get(),
    };
  });

  return (
    // Provide the 'value' to child components using the SwitchThemeContext context
    <SwitchThemeContext.Provider value={value}>
      {/* Main content container */}
      <View ref={viewRef} style={{ flex: 1 }} collapsable={false}>
        {children}
      </View>

      {/* Canvas for rendering visual effects, disabled pointer events so it doesn't interfere with user interactions */}
      <Canvas
        pointerEvents="none"
        style={{
          ...StyleSheet.absoluteFill, // Fill the entire space of the parent view
          width: windowWidth,
          height: windowHeight,
        }}>
        {/* Group to apply certain graphical operations, in this case, clipping */}
        <Group clip={clipPath} invertClip={invertClip}>
          {/* Image displaying a snapshot of the current view */}
          <Image
            x={0}
            y={0}
            width={windowWidth}
            height={windowHeight}
            image={skImage}
          />
        </Group>
      </Canvas>

      {/* Reanimated view for animated visual content */}
      <Reanimated.View
        style={[
          {
            ...StyleSheet.absoluteFill, // Fill the entire space of the parent view
            position: 'absolute',
          },
          rStyle, // Dynamically generated style for the theme switch animation
          {
            zIndex: 1000, // Ensure this view stays on top of others
            justifyContent: 'center', // Center content vertically
            alignItems: 'center', // Center content horizontally
          },
        ]}>
        {/* Lottie animation for the theme switch */}
        <AnimatedLottieView
          animatedProps={animatedProps}
          source={require('../../assets/switch-theme.json')} // Lottie animation file
          style={{
            height: MAX_THEME_ANIMATION_SIZE,
            width: MAX_THEME_ANIMATION_SIZE,
          }}
          colorFilters={[
            {
              keypath: 'Layer 1/icons Outlines',
              color: '#fff',
            },
          ]}
        />
      </Reanimated.View>
    </SwitchThemeContext.Provider>
  );
};

export { SwitchThemeButton, SwitchThemeProvider, useSwitchTheme };

import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { useMemo, useRef, useState } from 'react';

import {
  Canvas,
  Group,
  Image,
  Skia,
  makeImageFromView,
} from '@shopify/react-native-skia';
import Reanimated, {
  interpolate,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AnimatedLottieView } from '../animated-lottie-view';
import { SwitchThemeContext, useSwitchTheme, type Theme } from './context';
import {
  MAX_THEME_ANIMATION_SIZE,
  SwitchThemeButton,
} from './switch-theme-button';

import type { SkImage } from '@shopify/react-native-skia';
import type { StyleProp, ViewStyle } from 'react-native';

type SwitchThemeProviderProps = {
  children?: React.ReactNode;
};

export const SWITCH_THEME_ANIMATION_DURATION = 1000;

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

  const switchThemeStyle = useSharedValue({});
  const skImage = useSharedValue<SkImage | null>(null);

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

      // Define a function to toggle the theme,
      // which can be triggered by other components or events
      toggleTheme: async ({
        center: toggledItemCenter,
        style: toggledItemStyle,
      }: {
        center: { x: number; y: number; height: number; width: number };
        style: StyleProp<ViewStyle>;
      }) => {
        // If an animation is currently in progress, don't initiate a new one
        if (isAnimating.get()) return;

        // Indicate that the theme toggle animation is starting
        isAnimating.set(true);

        // Set `invertClip` to true if the current theme is not 'light'
        invertClip.set(theme !== 'light');

        // Create an image representation of the current view (snapshot)
        const image = await makeImageFromView(viewRef);
        skImage.set(image);

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
              if (finished) {
                skImage.set(null);
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

// Importing necessary libraries and components
import React, { useState } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Blur,
  Canvas,
  Circle,
  Group,
  Mask,
  rect,
} from '@shopify/react-native-skia';
import Animated, {
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Octicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { PressableScale } from 'pressto';

import { FractalGlassMask } from './components/fractal-glass-mask';

// Defining a type for the theme
type Theme = 'light' | 'dark';

// Constant for circle radius
const CircleRadius = 100;

// Main App component
const App = () => {
  // State for the theme
  const [theme, setTheme] = useState<Theme>('light');

  // Getting window dimensions
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Constants for positioning and dimensions
  const x = 40;
  const height = 300;
  const y = (windowHeight - height) / 2;
  const gradientsAmount = 4;
  const width = windowWidth - x * 2;

  // Shared values for animated circle position
  const cx = useSharedValue(180);
  const cy = useSharedValue(270);
  const prevCx = useSharedValue(0);
  const prevCy = useSharedValue(0);

  // Creating a Skia FractalMaskRectPath for the rectangle
  const fractalGlassMaskPath = rect(x, y, width, height);

  // Gesture handler for panning
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      prevCx.value = cx.value;
      prevCy.value = cy.value;
    })
    .onUpdate(event => {
      cx.value = prevCx.value + event.translationX;
      cy.value = prevCy.value + event.translationY;
    });

  // Styling for the background color
  const rBackgroundStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: withTiming(theme === 'light' ? 'white' : 'black'),
    };
  }, [theme]);

  // Derived value for circle color
  const circleColor = useDerivedValue(() => {
    return withTiming(theme === 'light' ? 'orange' : '#78C0E0');
  }, [theme]);

  // Styling for the floating circle background color
  const rFloatingBackgroundStyle = useAnimatedStyle(() => {
    return {
      backgroundColor: circleColor.value,
    };
  }, [theme]);

  // Styling for the fake circle position
  const rFakeCircleStyle = useAnimatedStyle(() => {
    return {
      left: cx.value - CircleRadius,
      top: cy.value - CircleRadius,
    };
  }, []);

  // Rendering the main UI
  return (
    <Animated.View style={[styles.fill, rBackgroundStyle]}>
      <GestureDetector gesture={panGesture}>
        {/* 1. Transparent (Fake) Circle */}
        <Animated.View
          style={[
            rFakeCircleStyle,
            {
              position: 'absolute',
              height: CircleRadius * 2,
              width: CircleRadius * 2,
              borderRadius: CircleRadius,
              zIndex: 100,
            },
          ]}
        />
      </GestureDetector>

      <Canvas style={styles.fill}>
        {/* Uncomment this code to visualize the FractalGlassMask component 🪄 */}
        {/* <FractalGlassMask
          x={x}
          y={y}
          width={width}
          height={height}
          gradientsN={gradientsAmount}
        /> */}
        <Group clip={fractalGlassMaskPath} invertClip>
          {/* 2. Default Circle */}
          <Circle cx={cx} cy={cy} r={CircleRadius} color={circleColor} />
        </Group>

        <Group clip={fractalGlassMaskPath}>
          <Mask
            mode="alpha"
            mask={
              <FractalGlassMask
                x={x}
                y={y}
                width={width}
                height={height}
                gradientsN={gradientsAmount}
              />
            }>
            {/* 3. Default Circle (Blurred Copy) */}
            <Circle
              cx={cx}
              cy={cy}
              r={CircleRadius}
              color={circleColor}
              clip={rect(x, y, width, height)}>
              <Blur blur={25} mode={'decal'} />
            </Circle>
          </Mask>
        </Group>
      </Canvas>

      {/* PressableScale component for theme toggle */}
      <PressableScale
        style={styles.floatingButton}
        onPress={() => {
          setTheme(theme === 'light' ? 'dark' : 'light');
        }}>
        <Animated.View
          style={[rFloatingBackgroundStyle, styles.floatingContent]}>
          <Octicons
            name={theme !== 'light' ? 'sun' : 'moon'}
            size={24}
            color="white"
          />
        </Animated.View>
      </PressableScale>
    </Animated.View>
  );
};

// Styles for the components
const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  floatingButton: {
    height: 58,
    aspectRatio: 1,
    position: 'absolute',
    bottom: 64,
    right: 64,
    zIndex: 100,
  },
  floatingContent: {
    borderRadius: 29,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// Exporting the App component
export { App as FractalGlass };

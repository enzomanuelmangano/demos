import {
  BlurMask,
  Canvas,
  Fill,
  RadialGradient,
  useFont,
  vec,
} from '@shopify/react-native-skia';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import Animated, { runOnJS, useSharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { GridVisualizer as GridVisualizerComponent } from './grid-visualizer';

const { width: WindowWidth, height: WindowHeight } = Dimensions.get('window');

const CanvasWidth = 300;
const CanvasHeight = 340;

const HSquares = 35;
const VSquares = 50;

const InternalPadding = 70;
const SquareSize = 2.5;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const fontAsset = require('./assets/fonts/SF-Pro-Rounded-Heavy.otf');
const fontSize = 120;

export function GridVisualizer() {
  const font = useFont(fontAsset, fontSize);
  // Keep in mind that this is a number, but you can use a string as well :)
  const text = useSharedValue<string | null>('99');

  const generateRandomText = useCallback(() => {
    // This is a hack to force to clear the grid before changing again the text
    // Try to comment this line and tap the screen multiple times to see what happens
    text.value = null;
    setTimeout(() => {
      text.value = Math.floor(Math.random() * 100).toString();
    }, 700);
  }, [text]);

  const tapGesture = Gesture.Tap().onTouchesUp(() => {
    runOnJS(generateRandomText)();
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      {/*
       * Honestly there was no need to use a GestureDetector for such a simple tap gesture
       */}
      <GestureDetector gesture={tapGesture}>
        <Animated.View>
          <GridVisualizerComponent
            text={text}
            width={CanvasWidth}
            height={CanvasHeight}
            hSquaresAmount={HSquares}
            vSquaresAmount={VSquares}
            scaleFactor={InternalPadding}
            font={font}
            squareSize={SquareSize}
          />
        </Animated.View>
      </GestureDetector>
      {/* That's just a subtle gradient behind the grid
       * to make it look a bit more interesting
       */}
      <Canvas
        style={{
          position: 'absolute',
          width: WindowWidth,
          height: WindowHeight,
          zIndex: -1,
        }}>
        <Fill>
          <RadialGradient
            c={vec(WindowWidth / 2, WindowHeight / 2)}
            r={WindowWidth}
            colors={['rgba(255,255,255,0.1)', 'transparent']}
          />
          <BlurMask blur={10} />
        </Fill>
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
});

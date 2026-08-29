import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import { Canvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import {
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { Carousel } from './components/carousel';
import { BACKGROUND_COLOR, data, windowWidth } from './constants';

// Feel free to use any odd number for the max rendered items
// I've used 5 since I like the result :)
const MAX_RENDERED_ITEMS = 5;
const INITIAL_ACTIVE_INDEX = Math.floor(MAX_RENDERED_ITEMS / 2);

export const ColorCarousel = () => {
  const activeIndex = useSharedValue(INITIAL_ACTIVE_INDEX);

  // e2e outcome probe: flips to "moved" once the active index leaves its
  // initial value, so a test can assert the swipe actually paged the carousel.
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');
  useAnimatedReaction(
    () => activeIndex.get(),
    index => {
      if (index !== INITIAL_ACTIVE_INDEX) {
        scheduleOnRN(setStatus, 'moved');
      }
    },
    [],
  );

  const radialBackgroundActiveColor = useDerivedValue(() => {
    return withTiming(data[activeIndex.get()]?.accentColor ?? BACKGROUND_COLOR);
  }, []);

  const radialGradientColors = useDerivedValue(() => {
    return [radialBackgroundActiveColor.get(), BACKGROUND_COLOR];
  }, [radialBackgroundActiveColor]);

  return (
    <View style={styles.container}>
      <Text testID="color-carousel-status" style={styles.statusProbe}>
        {`carousel:${status}`}
      </Text>
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
        }}>
        <Carousel
          items={data}
          maxRenderedItems={MAX_RENDERED_ITEMS}
          width={windowWidth}
          activeIndex={activeIndex}
        />
        <Canvas style={[StyleSheet.absoluteFill, { zIndex: -1 }]}>
          <Rect x={0} y={0} width={windowWidth} height={windowWidth}>
            <RadialGradient
              c={vec(windowWidth / 2, windowWidth / 2)}
              r={windowWidth / 2}
              colors={radialGradientColors}
            />
          </Rect>
        </Canvas>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: BACKGROUND_COLOR,
    flex: 1,
    justifyContent: 'center',
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
});

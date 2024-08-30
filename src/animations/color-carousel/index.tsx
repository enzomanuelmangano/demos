import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Canvas, RadialGradient, Rect, vec } from '@shopify/react-native-skia';
import {
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { Carousel } from './components/carousel';
import { BACKGROUND_COLOR, data, windowWidth } from './constants';

// Feel free to use any odd number for the max rendered items
// I've used 5 since I like the result :)
const MAX_RENDERED_ITEMS = 5;
const INITIAL_ACTIVE_INDEX = Math.floor(MAX_RENDERED_ITEMS / 2);

export const ColorCarousel = () => {
  const activeIndex = useSharedValue(INITIAL_ACTIVE_INDEX);

  const radialBackgroundActiveColor = useDerivedValue(() => {
    return withTiming(data[activeIndex.value]?.accentColor ?? BACKGROUND_COLOR);
  }, []);

  const radialGradientColors = useDerivedValue(() => {
    return [radialBackgroundActiveColor.value, BACKGROUND_COLOR];
  }, [radialBackgroundActiveColor]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View
        style={{
          width: '100%',
          aspectRatio: 1,
        }}>
        {/* That's the Reanimated Carousel */}
        <Carousel
          items={data}
          maxRenderedItems={MAX_RENDERED_ITEMS}
          width={windowWidth}
          activeIndex={activeIndex}
        />
        {/* That's the Radial Gradient in the Background */}
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
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

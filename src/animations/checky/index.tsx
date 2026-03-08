import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { StatusBar } from 'expo-status-bar';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { Paginator, ScrollFlame } from './components';

const MOODS_COUNT = 6;

export function Checky() {
  const { width: windowWidth } = useWindowDimensions();
  const progress = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: e => {
      progress.value = e.contentOffset.x / windowWidth;
    },
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Invisible ScrollView to control the mood */}
      <Animated.ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        decelerationRate="fast"
        disableIntervalMomentum
        snapToInterval={windowWidth}
        style={StyleSheet.absoluteFill}
        contentContainerStyle={{ width: windowWidth * MOODS_COUNT }}
      />

      {/* Flame centered on screen */}
      <View style={styles.flameContainer} pointerEvents="box-none">
        <ScrollFlame progress={progress} size={280} />
      </View>

      {/* Paginator */}
      <Paginator count={MOODS_COUNT} progress={progress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0A0A0A',
    flex: 1,
  },
  flameContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

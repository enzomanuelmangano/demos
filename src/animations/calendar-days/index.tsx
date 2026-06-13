import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import * as Haptics from 'expo-haptics';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AnimatedSlider } from './components/animated-slider';
import { CalendarCard } from './components/calendar-card';
import { HEADER_COLOR } from './components/calendar-card/constants';

const TOTAL_PAGES = 31;

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const progress = useSharedValue(0);

  const sliderWidth = windowWidth - 80;

  // e2e outcome probe: the flipped page lives in a worklet-driven slider, so we
  // bridge the slider's page index back to JS — "start" until the slider moves
  // off page 0, then "moved". Visually negligible (alpha ~0.01).
  const [status, setStatus] = useState<'start' | 'moved'>('start');
  useAnimatedReaction(
    () => Math.round(progress.get() * TOTAL_PAGES) > 0,
    (moved, prev) => {
      if (prev === null || moved === prev) return;
      scheduleOnRN(setStatus, moved ? 'moved' : 'start');
    },
  );

  // Pass the raw progress directly to the calendar
  // Each page handles its own spring animation independently
  // This allows multiple pages to flip simultaneously when scrolling fast
  useAnimatedReaction(
    () => Math.round(progress.get() * TOTAL_PAGES),
    (currentPage, prevPage) => {
      if (prevPage !== null && currentPage !== prevPage) {
        scheduleOnRN(Haptics.selectionAsync);
      }
    },
  );

  return (
    <View style={styles.container}>
      <Text testID="calendar-days-status" style={styles.statusProbe}>
        {status}
      </Text>
      <CalendarCard progress={progress} totalPages={TOTAL_PAGES} />
      <View testID="calendar-days-slider" style={styles.sliderWrapper}>
        <AnimatedSlider
          progress={progress}
          style={{ width: sliderWidth }}
          color={HEADER_COLOR}
          trackColor="rgba(0, 0, 0, 0.08)"
          pickerSize={40}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fcfcfc',
    flex: 1,
    justifyContent: 'center',
  },
  sliderWrapper: {
    marginTop: 60,
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#fcfcfc',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { App as CalendarDays };

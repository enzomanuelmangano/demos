import { StyleSheet, useWindowDimensions, View } from 'react-native';

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

  // Pass the raw progress directly to the calendar
  // Each page handles its own spring animation independently
  // This allows multiple pages to flip simultaneously when scrolling fast
  useAnimatedReaction(
    () => Math.round(progress.value * TOTAL_PAGES),
    (currentPage, prevPage) => {
      if (prevPage !== null && currentPage !== prevPage) {
        scheduleOnRN(Haptics.selectionAsync);
      }
    },
  );

  return (
    <View style={styles.container}>
      <CalendarCard progress={progress} totalPages={TOTAL_PAGES} />
      <View style={styles.sliderWrapper}>
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
});

export { App as CalendarDays };

import { StyleSheet, useWindowDimensions, View } from 'react-native';

import {
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AnimatedSlider } from './components/animated-slider';
import { CalendarCard } from './components/calendar-card';

const TOTAL_PAGES = 31;

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const progress = useSharedValue(0);

  const sliderWidth = windowWidth - 80;

  // Snap to nearest page (multiple of 1/TOTAL_PAGES) with spring animation
  const calendarProgress = useDerivedValue(() => {
    // Calculate which page we should snap to
    const pageIndex = Math.round(progress.value * TOTAL_PAGES);
    const snappedProgress = pageIndex / TOTAL_PAGES;

    return withSpring(snappedProgress, {
      mass: 0.5,
      damping: 15,
      stiffness: 150,
    });
  }, []);

  return (
    <View style={styles.container}>
      <CalendarCard progress={calendarProgress} totalPages={TOTAL_PAGES} />
      <View style={styles.sliderWrapper}>
        <AnimatedSlider
          progress={progress}
          style={{ width: sliderWidth }}
          color="#F07167"
          trackColor="rgba(0, 0, 0, 0.08)"
          pickerSize={28}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
  },
  sliderWrapper: {
    marginTop: 60,
  },
});

export { App as CalendarDays };

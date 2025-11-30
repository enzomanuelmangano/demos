import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { AnimatedSlider } from './components/animated-slider';
import { CalendarCard } from './components/calendar-card';

const TOTAL_PAGES = 31;

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const progress = useSharedValue(0);

  const sliderWidth = windowWidth - 80;

  // Pass the raw progress directly to the calendar
  // Each page handles its own spring animation independently
  // This allows multiple pages to flip simultaneously when scrolling fast
  const calendarProgress = useDerivedValue(() => {
    return progress.value;
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

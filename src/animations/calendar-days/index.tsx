import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { useSharedValue } from 'react-native-reanimated';

import { CalendarCard } from './components/calendar-card';
import { DaySlider } from './components/day-slider';

const TOTAL_PAGES = 31;

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const progress = useSharedValue(0);

  const sliderWidth = windowWidth - 100;

  return (
    <View style={styles.container}>
      <CalendarCard progress={progress} totalPages={TOTAL_PAGES} />
      <View style={styles.sliderWrapper}>
        <DaySlider progress={progress} style={{ width: sliderWidth }} />
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

import { StyleSheet, useWindowDimensions, View } from 'react-native';

import * as Haptics from 'expo-haptics';
import { useSharedValue } from 'react-native-reanimated';

import { CalendarCard } from './components/calendar-card';
import { DaySlider } from './components/day-slider';

const MAX_DAY = 31;

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const day = useSharedValue(1);
  const previousDay = useSharedValue(1);

  const sliderWidth = windowWidth - 100;

  const handleDayChange = (newDay: number) => {
    if (newDay !== previousDay.value) {
      Haptics.selectionAsync();
      previousDay.value = newDay;
    }
    day.value = newDay;
  };

  return (
    <View style={styles.container}>
      <CalendarCard day={day} maxDay={MAX_DAY} />
      <View style={styles.sliderWrapper}>
        <DaySlider
          minDay={1}
          maxDay={MAX_DAY}
          initialDay={1}
          style={{ width: sliderWidth }}
          onDayChange={handleDayChange}
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

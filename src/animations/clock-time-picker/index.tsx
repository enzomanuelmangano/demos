/**
 * Time Picker App
 *
 * Main application component that combines a Clock and TimeRange component
 * to create an interactive time selection interface.
 *
 * Features:
 * - Analog clock display
 * - Scrollable time range selector
 * - Timezone handling
 * - Smooth animations and transitions
 */

import { StyleSheet, View } from 'react-native';

import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { Clock } from './components/clock';
import { TimeRange } from './components/time-range';

// Handle timezone offset to ensure correct time display
// Note: This is a simple implementation. For production, consider using a proper timezone library
const TimezoneOffsetMs = -new Date().getTimezoneOffset() * 60000;

/**
 * Generate an array of time slots for the time range selector
 * Creates 20 time slots starting from 13:00 with 30-minute intervals
 */
const dates = new Array(20).fill(0).map((_, index) => {
  const hour = Math.floor(index / 2) + 13;
  const minutes = index % 2 === 0 ? 0 : 30;
  return new Date(2025, 0, 1, hour, minutes);
});

/**
 * Main App Component
 *
 * Orchestrates the time picker interface by:
 * 1. Managing shared time state
 * 2. Handling timezone adjustments
 * 3. Coordinating between Clock and TimeRange components
 */
export const ClockTimePicker = () => {
  const date = useSharedValue(dates[0].getTime());

  const clockDate = useDerivedValue(() => {
    'worklet';
    return date.value + TimezoneOffsetMs;
  });

  return (
    <View style={styles.container}>
      <View style={styles.pickerContainer}>
        <Clock date={clockDate} size={100} />

        <TimeRange
          dates={dates}
          onDateChange={updatedDate => {
            'worklet';
            date.value = updatedDate;
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#111',
    flex: 1,
    justifyContent: 'center',
  },
  pickerContainer: {
    alignItems: 'center',
    backgroundColor: '#111111',
    borderColor: '#222222',
    borderCurve: 'continuous',
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: '0px 0px 0px #000000',
    flexDirection: 'row',
    gap: 32,
    justifyContent: 'center',
    padding: 32,
  },
});

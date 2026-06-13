/**
 * TimeRange Component
 *
 * A scrollable time selector component that displays time options in a vertical list.
 * Features smooth scrolling with snap points, gradient overlays, and time interpolation.
 *
 * @component
 * @example
 * ```tsx
 * <TimeRange
 *   dates={timeOptions}
 *   onDateChange={(dateMs) => handleTimeChange(dateMs)}
 * />
 * ```
 */

import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useMemo, useState } from 'react';

import { format } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * Props for the TimeRange component
 * @property {Date[]} dates - Array of Date objects representing available time slots
 * @property {(dateMs: number) => void} onDateChange - Callback function called when time selection changes
 */
type TimePickerProps = {
  dates: Date[];
  onDateChange?: (dateMs: number) => void;
};

const ITEM_HEIGHT = 30; // Height of each time item in pixels
const TimeRangeHeight = ITEM_HEIGHT * 4; // Total height of visible time range

export const TimeRange: React.FC<TimePickerProps> = ({
  dates,
  onDateChange,
}) => {
  const datesMs = useMemo(() => dates.map(date => date.getTime()), [dates]);

  // Hoisted out of the scroll worklet: the React Compiler extracts inline
  // callbacks from worklets ("_temp" crash), and mapping on every scroll
  // frame was wasted work anyway. Shared with snapToOffsets below.
  const itemOffsets = useMemo(
    () => datesMs.map((_, i) => i * ITEM_HEIGHT),
    [datesMs],
  );

  const formattedDates = useMemo(
    () => dates.map(date => format(date, 'h:mm aaa').toLowerCase()),
    [dates],
  );

  /**
   * Renders individual time items in the list
   * @param {Object} param0 - Item data and index
   * @returns {JSX.Element} Rendered time item
   */
  const renderItem = useCallback(
    ({ item, index }: { item: string; index: number }) => (
      <View key={index} style={styles.timeItem}>
        <Text style={styles.timeText}>{item}</Text>
      </View>
    ),
    [],
  );

  /**
   * Handles scroll events and interpolates the selected time
   * Uses Reanimated worklet for smooth performance
   */
  // e2e outcome probe: bridge a 'moved' flag once the wheel actually scrolls.
  const [moved, setMoved] = useState(false);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      const { contentOffset } = event;
      const interpolatedDate = interpolate(
        contentOffset.y,
        itemOffsets,
        datesMs,
      );
      onDateChange?.(interpolatedDate);
      if (contentOffset.y > 1) {
        scheduleOnRN(setMoved, true);
      }
    },
  });

  return (
    <View style={styles.container}>
      {/* e2e outcome probe: near-invisible (alpha ~0.01). */}
      <Text testID="clock-time-picker-status" style={styles.statusProbe}>
        {moved ? 'moved' : 'idle'}
      </Text>
      <Animated.FlatList
        testID="clock-time-picker-wheel"
        onScroll={onScroll}
        decelerationRate="fast"
        snapToAlignment="center"
        snapToOffsets={itemOffsets}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
        style={{ width: 100 }}
        data={formattedDates}
        renderItem={renderItem}
        disableIntervalMomentum
      />

      <LinearGradient
        colors={['#111111', '#11111100']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 0.5 }}
        style={[styles.gradient, styles.bottomGradient]}
      />
      <LinearGradient
        colors={['#11111100', '#111111']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 0, y: 1 }}
        style={[styles.gradient, styles.topGradient]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  bottomGradient: {
    bottom: 0,
  },
  container: {
    height: TimeRangeHeight,
  },
  gradient: {
    height: TimeRangeHeight,
    left: 0,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    zIndex: 100,
  },
  scrollViewContent: {
    paddingVertical: TimeRangeHeight / 2 - ITEM_HEIGHT / 2,
  },
  statusProbe: {
    color: '#111111',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 200,
  },
  timeItem: {
    alignItems: 'center',
    height: ITEM_HEIGHT,
    justifyContent: 'center',
  },
  timeText: {
    color: '#d8d8d8',
    fontFamily: 'Honk-Regular',
    fontSize: 20,
  },
  topGradient: {
    top: 0,
  },
});

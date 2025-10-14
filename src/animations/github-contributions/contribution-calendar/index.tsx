import { StyleSheet, Text, View } from 'react-native';

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';

import { eachDayOfInterval, endOfWeek, format, startOfWeek } from 'date-fns';
import { useSharedValue } from 'react-native-reanimated';

import {
  ContributionSquare,
  SquareAnimationControls,
} from './contribution-square';
import {
  CalendarAnimationControls,
  ContributionData,
  ContributionLevel,
} from './types';
import { ColorScheme, DEFAULT_COLOR_SCHEME } from '../config/defaults';
import { generateDayLabels, groupDaysIntoWeeks } from './utils/date-utils';

const dayLabels = generateDayLabels();

export type GitHubContributionCalendarProps = {
  data: ContributionData;
  colorScheme?: ColorScheme;
};

export const GitHubContributionCalendar = forwardRef<
  CalendarAnimationControls,
  GitHubContributionCalendarProps
>(({ data, colorScheme = DEFAULT_COLOR_SCHEME }, ref) => {
  const squareRefs = useRef<(SquareAnimationControls | null)[]>([]);
  const isAnimating = useSharedValue(false);

  const { startDate, endDate } = useMemo(() => {
    const dates = Object.keys(data)
      .map(dateStr => new Date(dateStr))
      .sort((a, b) => a.getTime() - b.getTime());
    return {
      startDate: dates[0],
      endDate: dates[dates.length - 1],
    };
  }, [data]);

  const weeks = useMemo(() => {
    const calendarStart = startOfWeek(startDate, { weekStartsOn: 1 });
    const calendarEnd = endOfWeek(endDate, { weekStartsOn: 1 });

    const allCalendarDays = eachDayOfInterval({
      start: calendarStart,
      end: calendarEnd,
    });

    return groupDaysIntoWeeks(allCalendarDays);
  }, [startDate, endDate]);

  const squareIndexMap = useMemo(() => {
    const indexMap = new Map<string, number>();
    let squareIndex = 0;

    weeks.forEach((week, weekIndex) => {
      week.forEach((date, dayIndex) => {
        const isInDataRange = date >= startDate && date <= endDate;
        if (isInDataRange) {
          const key = `${weekIndex}-${dayIndex}`;
          indexMap.set(key, squareIndex);
          squareIndex++;
        }
      });
    });

    return indexMap;
  }, [weeks, startDate, endDate]);

  const startAnimation = useCallback(() => {
    isAnimating.value = true;
    squareRefs.current.forEach(squareRef => {
      squareRef?.startAnimation();
    });
  }, [isAnimating]);

  const resetAnimation = useCallback(() => {
    isAnimating.value = false;
    squareRefs.current.forEach(squareRef => {
      squareRef?.resetAnimation();
    });
  }, [isAnimating]);

  const toggleAnimation = useCallback(() => {
    if (isAnimating.value) {
      return resetAnimation();
    }
    return startAnimation();
  }, [startAnimation, resetAnimation, isAnimating]);

  useImperativeHandle(
    ref,
    () => ({
      startAnimation: startAnimation,
      resetAnimation: resetAnimation,
      toggleAnimation: toggleAnimation,
    }),
    [startAnimation, resetAnimation, toggleAnimation],
  );

  return (
    <View style={styles.calendarContainer}>
      <View style={styles.calendarGrid}>
        <View style={styles.dayLabelsContainer}>
          {dayLabels.map(day => (
            <Text key={day} style={styles.dayLabel}>
              {day}
            </Text>
          ))}
        </View>

        <View style={styles.gridContainer}>
          {weeks.map((week, weekIndex) => (
            <View key={weekIndex} style={styles.week}>
              {week.map((date, dayIndex) => {
                const dateStr = format(date, 'yyyy-MM-dd');
                const level = data[dateStr] || 0;

                const isInDataRange = date >= startDate && date <= endDate;

                if (!isInDataRange) {
                  return (
                    <View
                      key={`empty-${weekIndex}-${dayIndex}`}
                      style={[styles.square, styles.emptySquare]}
                    />
                  );
                }

                const squareIndex = squareIndexMap.get(
                  `${weekIndex}-${dayIndex}`,
                )!;
                return (
                  <ContributionSquare
                    key={`${weekIndex}-${dayIndex}`}
                    ref={el => {
                      squareRefs.current[squareIndex] = el;
                    }}
                    level={level as ContributionLevel}
                    weekIndex={weekIndex}
                    dayIndex={dayIndex}
                    colorScheme={colorScheme}
                  />
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  calendarContainer: {
    backgroundColor: '#ffffff',
    borderCurve: 'continuous',
    borderRadius: 16,
    boxShadow: '0px 0px 20px 0px rgba(0, 0, 0, 0.05)',
    padding: 16,
  },
  calendarGrid: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  dayLabel: {
    color: '#656d76',
    fontFamily: 'regular',
    fontSize: 11,
    height: 14,
    marginBottom: 3,
    textAlign: 'left',
    textAlignVertical: 'center',
    width: 25,
  },
  dayLabelsContainer: {
    justifyContent: 'flex-start',
    marginRight: 8,
  },
  emptySquare: {
    backgroundColor: 'transparent',
  },
  gridContainer: {
    alignItems: 'flex-start',
    flexDirection: 'row',
  },
  square: {
    borderCurve: 'continuous',
    borderRadius: 2,
    height: 14,
    marginBottom: 3,
    width: 14,
  },
  week: {
    marginRight: 3,
  },
});

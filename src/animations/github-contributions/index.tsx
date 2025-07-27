import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { COLOR_SCHEMES } from './config/defaults';
import type { CalendarAnimationControls } from './contribution-calendar';
import { GitHubContributionCalendar } from './contribution-calendar';
import { generateContributionData } from './contribution-data';

export const GitHubContributions = () => {
  const calendarRef = useRef<CalendarAnimationControls>(null);
  const { width: windowWidth } = useWindowDimensions();
  const calendarWidth = windowWidth * 0.9;

  const contributionData = useMemo(() => {
    // this calculation should require a bit more love, but it's a start 😅
    return generateContributionData({
      days: Math.floor(calendarWidth / 3),
    });
  }, [calendarWidth]);

  const handleToggleAnimation = () => {
    calendarRef.current?.toggleAnimation();
  };

  return (
    <View style={styles.appContainer} onTouchStart={handleToggleAnimation}>
      <StatusBar style="auto" />
      <GitHubContributionCalendar
        ref={calendarRef}
        data={contributionData}
        colorScheme={COLOR_SCHEMES.github}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#f7f7f7',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

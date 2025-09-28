import { useMemo, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

import { COLOR_SCHEMES } from './config/defaults';
import { GitHubContributionCalendar } from './contribution-calendar';
import { CalendarAnimationControls } from './contribution-calendar/types';
import { generateContributionData } from './contribution-data';

export const GitHubContributions = () => {
  const calendarRef = useRef<CalendarAnimationControls>(null);
  const { width: windowWidth } = useWindowDimensions();
  const calendarWidth = windowWidth * 0.9;

  const contributionData = useMemo(() => {
    return generateContributionData({
      days: Math.floor(calendarWidth / 3),
    });
  }, [calendarWidth]);

  const handleToggleAnimation = () => {
    calendarRef.current?.toggleAnimation();
  };

  return (
    <View style={styles.appContainer} onTouchStart={handleToggleAnimation}>
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

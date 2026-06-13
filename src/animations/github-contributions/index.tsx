import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useMemo, useRef } from 'react';

import { PressableScale } from 'pressto';

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
    <View style={styles.appContainer}>
      {/* e2e probe: passive self-running wave; assert the surface mounted.
          Near-invisible (alpha ~0.01). */}
      <Text testID="github-contributions-status" style={styles.statusProbe}>
        ready
      </Text>
      <PressableScale
        testID="github-contributions-surface"
        style={styles.appContainer}
        onPress={handleToggleAnimation}>
        <GitHubContributionCalendar
          ref={calendarRef}
          data={contributionData}
          colorScheme={COLOR_SCHEMES.github}
        />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  appContainer: {
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    flex: 1,
    justifyContent: 'center',
  },
  statusProbe: {
    color: '#f7f7f7',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
    zIndex: 999,
  },
});

import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useCallback, useState } from 'react';

import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedReaction,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { WeeklyChart } from './components/weekly-chart';
import { data, weekLabels } from './constants';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();

  // These three hooks are used to synchronize the get the current active index of the scroll view
  const scrollOffset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.set(event.contentOffset.x);
    },
  });
  const activeIndex = useDerivedValue(() => {
    return Math.floor((scrollOffset.get() + windowWidth / 2) / windowWidth);
  }, [scrollOffset]);

  // e2e outcome probe: flips to "moved" once paging changes the active week so
  // a test can assert the selection actually changed (the bars are Skia-only).
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  useAnimatedReaction(
    () => activeIndex.get(),
    (curr, prev) => {
      if (curr !== prev && prev !== null) {
        scheduleOnRN(Haptics.selectionAsync);
        scheduleOnRN(setStatus, 'moved');
      }
    },
  );
  const animatedData = useDerivedValue(() => {
    return data[activeIndex.get()];
  }, [activeIndex, data]);

  const renderItem = useCallback(
    ({ index }: { index: number }) => {
      return (
        <View
          key={index}
          style={[
            {
              width: windowWidth,
            },
            styles.labelContainer,
          ]}>
          <Text style={styles.label}>{weekLabels[index]}</Text>
        </View>
      );
    },
    [windowWidth],
  );

  return (
    <View style={styles.container}>
      <Text testID="miles-bar-chart-status" style={styles.statusProbe}>
        {status}
      </Text>
      <WeeklyChart width={windowWidth} height={150} data={animatedData} />
      <View
        style={{
          height: 60,
          width: windowWidth,
        }}>
        <Animated.FlatList
          testID="miles-bar-chart-weeks"
          onScroll={onScroll}
          horizontal
          snapToInterval={windowWidth}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          decelerationRate={'fast'}
          data={data}
          hitSlop={100}
          renderItem={renderItem}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#392F40',
    flex: 1,
    justifyContent: 'center',
  },
  label: {
    color: 'white',
    fontFamily: 'FiraCode-Regular',
    fontSize: 16,
  },
  labelContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 20,
  },
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#FFFFFF',
    opacity: 0.012,
    zIndex: 10,
  },
});

export { App };

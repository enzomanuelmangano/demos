import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useCallback } from 'react';

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
      scrollOffset.value = event.contentOffset.x;
    },
  });
  const activeIndex = useDerivedValue(() => {
    return Math.floor((scrollOffset.value + windowWidth / 2) / windowWidth);
  }, [scrollOffset]);

  useAnimatedReaction(
    () => activeIndex.value,
    (curr, prev) => {
      if (curr !== prev && prev !== null) {
        scheduleOnRN(Haptics.selectionAsync);
      }
    },
  );
  const animatedData = useDerivedValue(() => {
    return data[activeIndex.value];
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
      <WeeklyChart width={windowWidth} height={150} data={animatedData} />
      <View
        style={{
          height: 60,
          width: windowWidth,
        }}>
        <Animated.FlatList
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
});

export { App };

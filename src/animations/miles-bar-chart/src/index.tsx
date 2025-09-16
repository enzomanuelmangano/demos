import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  useAnimatedRef,
  useDerivedValue,
  useScrollViewOffset,
} from 'react-native-reanimated';

import { WeeklyChart } from './components/weekly-chart';
import { data, weekLabels } from './constants';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();

  // These three hooks are used to synchronize the get the current active index of the scroll view
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const animatedRef = useAnimatedRef<any>();
  const scrollOffset = useScrollViewOffset(animatedRef);
  const activeIndex = useDerivedValue(() => {
    return Math.floor((scrollOffset.value + windowWidth / 2) / windowWidth);
  }, [scrollOffset]);

  const animatedData = useDerivedValue(() => {
    return data[activeIndex.value];
  }, [activeIndex, data]);

  return (
    <View style={styles.container}>
      <WeeklyChart width={windowWidth} height={150} data={animatedData} />
      <View
        style={{
          height: 60,
          width: windowWidth,
        }}>
        <Animated.FlatList
          ref={animatedRef}
          horizontal
          snapToInterval={windowWidth}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          decelerationRate={'fast'}
          data={data}
          hitSlop={100}
          renderItem={({ index }) => {
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
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#392F40',
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    paddingTop: 20,
  },
  labelContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    color: 'white',
    fontFamily: 'FiraCode-Regular',
    fontSize: 16,
  },
});

export { App };

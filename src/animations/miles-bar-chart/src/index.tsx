import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { format } from 'date-fns';
import Animated, {
  runOnJS,
  useAnimatedReaction,
  useAnimatedRef,
  useDerivedValue,
  useScrollViewOffset,
} from 'react-native-reanimated';
import { useState } from 'react';

import { WeeklyChart } from './components/weekly-chart';
import { data } from './constants';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();

  // These three hooks are used to synchronize the get the current active index of the scroll view
  const animatedRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollViewOffset(animatedRef);
  const activeIndex = useDerivedValue(() => {
    return Math.floor((scrollOffset.value + windowWidth / 2) / windowWidth);
  }, [scrollOffset]);

  // These two hooks are used to convert the animated value to a regular JS value
  // WHY?
  // It's all about this component:
  //  <WeeklyChart
  //   width={windowWidth}
  //   height={150}
  //   data={data[activeIndexJS]}
  // />
  // data[activeIndex.value] won't work because the SharedValue won't trigger a status update
  // We need to use a regular js state to trigger a re-render
  const [activeIndexJS, setActiveIndexJS] = useState(0);
  // You can see the useAnimatedReaction below as a "useEffect" that listens to the activeIndex value
  useAnimatedReaction(
    () => {
      return activeIndex.value;
    },
    (current, previous) => {
      if (current !== previous) {
        runOnJS(setActiveIndexJS)(current);
      }
    },
  );

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <WeeklyChart
        width={windowWidth}
        height={150}
        data={data[activeIndexJS]}
      />
      <View
        style={{
          height: 60,
          width: windowWidth,
        }}>
        <Animated.ScrollView
          ref={animatedRef}
          horizontal
          snapToInterval={windowWidth}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          decelerationRate={'fast'}>
          {data.map((week, index) => {
            const [{ day }] = week;

            return (
              <View
                key={index}
                style={[
                  {
                    width: windowWidth,
                  },
                  styles.labelContainer,
                ]}>
                <Text style={styles.label}>
                  week of {format(day, 'd MMMM')}
                </Text>
              </View>
            );
          })}
        </Animated.ScrollView>
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

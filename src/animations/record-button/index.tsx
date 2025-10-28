import { Dimensions, StyleSheet, Text } from 'react-native';

import { useCallback } from 'react';

import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
} from 'react-native-reanimated';

import { RecordButton as RecordButtonComponent } from './components/record-button';

import type { FlatList } from 'react-native';

const { width: WindowWidth, height: WindowHeight } = Dimensions.get('window');

// Constants for the button size and style (you can play with these values)
const ButtonWidth = 90;
const ButtonHeight = 40;
const ButtonRadius = 20;
const StrokeWidth = 1;
const ButtonColor = '#ed4e3c';

export const RecordButton = () => {
  const scrollRef = useAnimatedRef<FlatList>();

  // Really nice hook from Reanimated to track the scroll offset
  const scrollOffset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      scrollOffset.value = event.contentOffset.y;
    },
  });

  const onButtonPress = useCallback(() => {
    scrollRef.current?.scrollToIndex({ index: 0 });
  }, [scrollRef]);

  const rMainPageStyle = useAnimatedStyle(() => {
    return {
      borderCurve: 'continuous',
      borderRadius: interpolate(
        scrollOffset.value,
        [0, 0.1],
        [0, 35],
        Extrapolation.CLAMP,
      ),
    };
  }, []);

  // Calculate the progress by interpolating the scroll offset
  const progress = useDerivedValue(() => {
    const inputRange = [WindowHeight * 0.08, WindowHeight * 0.2];
    const outputRange = [0, 1];

    return interpolate(
      scrollOffset.value,
      inputRange,
      outputRange,
      Extrapolation.CLAMP,
    );
  }, [scrollOffset]);

  // These values are used to handle the snapping behavior
  // Honestly, I'm really unhappy with this code
  // This was made to copy the behavior of the original app
  const shouldEnableSnapping = useSharedValue(false);

  const onScrollBeginDrag = useCallback(() => {
    shouldEnableSnapping.value = progress.value < 0.9;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onScrollEndDrag = useCallback(() => {
    if (progress.value > 0.97 && shouldEnableSnapping.value) {
      scrollRef.current?.scrollToIndex({ index: 1 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: 'HomeScreen' | 'TopScreen' }) => {
      if (item === 'HomeScreen') {
        return (
          <Animated.View
            style={[
              { ...styles.container, backgroundColor: '#191919' },
              rMainPageStyle,
            ]}>
            <Text
              style={{
                fontSize: 18,
                color: '#fff',
              }}>
              Scroll
            </Text>
          </Animated.View>
        );
      }
      return (
        <Animated.View style={styles.container}>
          <RecordButtonComponent
            style={{
              position: 'absolute',
              bottom: ButtonHeight,
            }}
            onPress={onButtonPress}
            width={ButtonWidth}
            height={ButtonHeight}
            progress={progress}
            strokeWidth={StrokeWidth}
            borderRadius={ButtonRadius}
            color={ButtonColor}
          />
        </Animated.View>
      );
    },
    [onButtonPress, progress, rMainPageStyle],
  );

  return (
    <Animated.FlatList
      style={styles.list}
      inverted
      bounces={false}
      showsVerticalScrollIndicator={false}
      onScrollBeginDrag={onScrollBeginDrag}
      onScrollEndDrag={onScrollEndDrag}
      onScroll={onScroll}
      ref={scrollRef}
      overScrollMode="never"
      decelerationRate={'fast'}
      snapToInterval={WindowHeight}
      data={['HomeScreen', 'TopScreen'] as const}
      renderItem={renderItem}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#252525',
    height: WindowHeight,
    justifyContent: 'center',
    width: WindowWidth,
  },
  list: { backgroundColor: '#252525', flex: 1 },
});

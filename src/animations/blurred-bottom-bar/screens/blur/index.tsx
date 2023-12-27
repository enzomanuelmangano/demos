import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Animated, {
  FadeIn,
  Layout,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { BlurredItem } from './components/BlurredItem';

const BlurredScroll = () => {
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const contentOffsetY = useSharedValue(0);

  const blurredItemContainerHeight = windowHeight * 0.45;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: event => {
      contentOffsetY.value = event.contentOffset.y;
    },
  });

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.FlatList
        layout={Layout}
        entering={FadeIn}
        onScroll={scrollHandler}
        contentContainerStyle={{
          paddingTop: windowHeight / 2 - blurredItemContainerHeight / 2,
          paddingBottom: windowHeight / 2 - blurredItemContainerHeight / 2,
        }}
        scrollEventThrottle={16}
        data={new Array(10).fill(0).map((_, index) => index)}
        getItemLayout={(_, index) => {
          return {
            length: windowHeight,
            offset: blurredItemContainerHeight * index,
            index,
          };
        }}
        renderItem={({ index }) => (
          <BlurredItem
            width={windowWidth}
            height={blurredItemContainerHeight}
            index={index}
            contentOffsetY={contentOffsetY}
          />
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
});

export { BlurredScroll };

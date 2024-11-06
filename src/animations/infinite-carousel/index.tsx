import { StyleSheet, View } from 'react-native';
import {
  Extrapolation,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useRef } from 'react';

import type { InfiniteCircularCarouselRef } from './components/infinite-circular-carousel';
import { InfiniteCircularCarousel } from './components/infinite-circular-carousel';
import { ThemeData } from './constants';
import { ListItemCard, ListItemSize } from './components/list-item-calc';
import { BackgroundGradient } from './components/background-gradient';

export const InfiniteCarousel = () => {
  const ref = useRef<InfiniteCircularCarouselRef>(null);

  const activeIndex = useSharedValue(0);

  const backgroundPrimaryColor = useDerivedValue(() => {
    return withTiming(ThemeData[activeIndex.value].primary, {
      duration: 500,
    });
  }, [activeIndex]);

  return (
    <View style={styles.container}>
      <BackgroundGradient mainColor={backgroundPrimaryColor} />
      <View
      // IMPORTANT!
      // By uncommenting the style below, you can really see
      // How the "Infinite" effect is working
      // style={{
      //   transform: [{ scale: 0.25 }],
      // }}
      >
        <InfiniteCircularCarousel
          ref={ref}
          data={ThemeData}
          listItemWidth={ListItemSize}
          centered
          snapEnabled
          onActiveIndexChanged={index => {
            'worklet';
            activeIndex.value = index;
          }}
          // You can configure the interpolation here
          // This will determing how the progress (in the renderItem)
          // is calculated
          // By default, it's set to a simple linear interpolation
          interpolateConfig={{
            inputRange: index => {
              'worklet';
              return [
                (index - 2) * ListItemSize,
                (index - 1) * ListItemSize,
                index * ListItemSize,
                (index + 1) * ListItemSize,
                (index + 2) * ListItemSize,
              ];
            },
            outputRange: () => {
              'worklet';
              return [-1, -1.5, 0, 1.5, 1];
            },
            extrapolationType: Extrapolation.CLAMP,
          }}
          renderItem={({ item, index, progress }) => {
            return (
              <ListItemCard
                item={item}
                onPress={() => {
                  ref.current?.scrollToIndex(index);
                }}
                index={index}
                progress={progress}
              />
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
    alignItems: 'center',
    justifyContent: 'center',
  },
});

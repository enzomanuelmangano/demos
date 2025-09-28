import { type FC } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

import { CircularListItem, LIST_ITEM_WIDTH } from './list-item';

type CircularListProps = {
  data: string[];
  scaleEnabled?: boolean;
};

const CircularList: FC<CircularListProps> = ({ data, scaleEnabled }) => {
  const contentOffset = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: event => {
      contentOffset.value = event.contentOffset.x;
    },
  });

  return (
    // Animated.FlatList renders the circular list
    <Animated.FlatList
      // Snap each item to the width of a list item
      snapToInterval={LIST_ITEM_WIDTH}
      showsHorizontalScrollIndicator={false}
      style={styles.list}
      // Enable paging for smooth snapping
      pagingEnabled
      contentContainerStyle={styles.listContent}
      horizontal
      data={data}
      // Throttle scroll events to every 16ms for smoother performance
      scrollEventThrottle={16}
      // Listen to scroll events to update the content offset shared value
      onScroll={onScroll}
      renderItem={({ index }) => (
        <CircularListItem
          imageUri={data[index]}
          scaleEnabled={scaleEnabled}
          index={index}
          contentOffset={contentOffset}
        />
      )}
      keyExtractor={(_, index) => index.toString()}
    />
  );
};

const styles = StyleSheet.create({
  list: {
    position: 'absolute',
    bottom: 0,
    height: LIST_ITEM_WIDTH * 3,
    left: 0,
    right: 0,
  },
  listContent: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingRight: LIST_ITEM_WIDTH * 3,
  },
});

export { CircularList };

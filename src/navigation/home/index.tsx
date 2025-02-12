import React, { useCallback } from 'react';
import type { ListRenderItem, ViewToken } from 'react-native';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useAtomValue } from 'jotai';

import type { Screens } from '../screens';
import { ActiveScreensAtom } from '../states/filters';

import { ListItem } from './components/list-item';

const LIST_ITEM_HEIGHT = 80;
const LIST_ITEM_MARGIN_TOP = 10;

const Home = React.memo(() => {
  const navigation = useNavigation();

  const viewableItems = useSharedValue<ViewToken[]>([]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
      viewableItems.value = vItems;
    },
    [viewableItems],
  );

  const renderItem: ListRenderItem<(typeof Screens)[number]> = useCallback(
    ({ item }) => {
      return (
        <ListItem
          style={styles.listItem}
          item={item}
          viewableItems={viewableItems}
          onPress={() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            navigation.navigate(item.route);
          }}
        />
      );
    },
    [navigation, viewableItems],
  );

  const data = useAtomValue(ActiveScreensAtom);

  const getItemLayout = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_: any, index: number) => ({
      length: LIST_ITEM_HEIGHT,
      offset: LIST_ITEM_HEIGHT * index + LIST_ITEM_MARGIN_TOP * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback(
    (item: (typeof Screens)[number]) => item.route,
    [],
  );

  return (
    <Animated.FlatList
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
      keyExtractor={keyExtractor}
      data={data}
      scrollEventThrottle={16}
      style={styles.container}
      keyboardDismissMode={'on-drag'}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      renderItem={renderItem}
      getItemLayout={getItemLayout}
    />
  );
});

const viewabilityConfig = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 100,
};

const styles = StyleSheet.create({
  content: {
    paddingTop: 3,
    paddingBottom: 150,
  },
  container: { backgroundColor: 'black' },
  listItem: { height: LIST_ITEM_HEIGHT, marginTop: LIST_ITEM_MARGIN_TOP },
});

export { Home };

import React, { useCallback } from 'react';
import type { ListRenderItem, ViewToken } from 'react-native';
import { StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Animated, { useSharedValue } from 'react-native-reanimated';
import { useAtomValue } from 'jotai';

import type { Screens } from '../screens';
import { ActiveScreensAtom } from '../states/filters';

import { ListItem } from './components/list-item';

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

  return (
    <Animated.FlatList
      onViewableItemsChanged={onViewableItemsChanged}
      data={data}
      scrollEventThrottle={16}
      style={styles.container}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      renderItem={renderItem}
    />
  );
});

const styles = StyleSheet.create({
  content: {
    paddingBottom: 150,
  },
  container: { backgroundColor: 'black' },
});

export { Home };

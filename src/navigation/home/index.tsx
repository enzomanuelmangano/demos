import React, { useCallback } from 'react';
import type { ViewToken } from 'react-native';
import { FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';

import { Screens } from '../screens';

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

  return (
    <FlatList
      onViewableItemsChanged={onViewableItemsChanged}
      data={Screens}
      style={{ backgroundColor: 'black' }}
      contentContainerStyle={{
        paddingBottom: 150,
      }}
      contentInsetAdjustmentBehavior="automatic"
      renderItem={({ item }) => (
        <ListItem
          item={item}
          viewableItems={viewableItems}
          onPress={() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            navigation.navigate(item.route);
          }}
        />
      )}
    />
  );
});

export { Home };

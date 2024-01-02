import React, { useCallback } from 'react';
import type { ViewToken } from 'react-native';
import { FlatList, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useSharedValue } from 'react-native-reanimated';

import { Screens } from '../screens';

import { ListItem } from './components/list-item';

const Home = React.memo(() => {
  const navigation = useNavigation();

  const { top: safeTop } = useSafeAreaInsets();
  const viewableItems = useSharedValue<ViewToken[]>([]);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems: vItems }: { viewableItems: ViewToken[] }) => {
      viewableItems.value = vItems;
    },
    [viewableItems],
  );

  return (
    <>
      <StatusBar barStyle="dark-content" />
      <FlatList
        onViewableItemsChanged={onViewableItemsChanged}
        data={Screens}
        style={{ backgroundColor: '#F5F5F5' }}
        contentContainerStyle={{
          paddingTop: safeTop,
          paddingBottom: 50,
        }}
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
    </>
  );
});

export { Home };

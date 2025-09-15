import { LegendList, type LegendListRenderItemProps } from '@legendapp/list';
import { useNavigation } from '@react-navigation/native';
import { useAtomValue } from 'jotai';
import React, { useCallback } from 'react';
import { StyleSheet } from 'react-native';

import type { Screens } from '../screens';
import { ActiveScreensAtom } from '../states/filters';

import { ListItem } from './components/list-item';

const LIST_ITEM_HEIGHT = 80;
const LIST_ITEM_MARGIN_TOP = 10;

const Home = React.memo(() => {
  const navigation = useNavigation();

  const renderItem = useCallback(
    ({ item }: LegendListRenderItemProps<(typeof Screens)[number]>) => {
      return (
        <ListItem
          style={styles.listItem}
          item={item}
          onPress={() => {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore
            navigation.navigate(item.route);
          }}
        />
      );
    },
    [navigation],
  );

  const data = useAtomValue(ActiveScreensAtom);

  const keyExtractor = useCallback(
    (item: (typeof Screens)[number]) => item.route,
    [],
  );

  return (
    <LegendList
      keyExtractor={keyExtractor}
      data={data}
      scrollEventThrottle={16}
      style={styles.container}
      keyboardDismissMode={'on-drag'}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      renderItem={renderItem}
    />
  );
});

const styles = StyleSheet.create({
  content: {
    paddingTop: 3,
    paddingBottom: 150,
  },
  container: { backgroundColor: 'black' },
  listItem: { height: LIST_ITEM_HEIGHT, marginTop: LIST_ITEM_MARGIN_TOP },
});

export { Home };

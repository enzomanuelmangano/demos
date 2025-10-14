import { StyleSheet, Text, View } from 'react-native';

import { memo, useCallback } from 'react';

import { useSetAtom } from 'jotai';

import { ActiveItemKeyAtom, HistoryAtom } from '../atoms/history-atom';
import { LIST_ITEM_HEIGHT, generateKey } from '../constants';
import { SortableList } from '../drag-to-sort/components/SortableList';

import type { Positions } from '../drag-to-sort/components/SortableList/types';

type TodoItem = {
  id: string;
  title: string;
  emoji: string;
};

const TODO_ITEMS: TodoItem[] = [
  {
    id: '1',
    title: 'Feed the cat',
    emoji: '🐱',
  },
  {
    id: '2',
    title: 'Flex useless animations',
    emoji: '🤸‍♂️',
  },
  {
    id: '4',
    title: 'Water the plants',
    emoji: '🌱',
  },
  {
    id: '3',
    title: 'Buy groceries',
    emoji: '🍎',
  },
];

type PriorityListViewProps = {
  items: number[];
};

export const PriorityListView = memo(({ items }: PriorityListViewProps) => {
  const setTarget = useSetAtom(HistoryAtom);
  const setActiveItemKey = useSetAtom(ActiveItemKeyAtom);

  const onDragEnd = useCallback(
    (positions: Positions) => {
      const heightArray = Object.entries(positions).map(([idx, height]) => [
        parseInt(idx, 10),
        height,
      ]);

      // Sort the array based on the height (second element in each pair)
      heightArray.sort((a, b) => a[1] - b[1]);

      // Extract the sorted indices to get the new order
      const newOrder = heightArray.map(([idx]) => idx);

      // Map the new order back to the actual data values
      const newData = newOrder.map(i => items[i]);
      const newKey = generateKey();
      setActiveItemKey(newKey);
      setTarget(prev => [
        {
          items: newData,
          key: newKey,
        },
        ...prev,
      ]);
    },
    [setActiveItemKey, setTarget, items],
  );

  const renderItem = useCallback(({ item }: { item: number }) => {
    // Map number to todo item (1-based indexing)
    const todoItem = TODO_ITEMS[item - 1] || TODO_ITEMS[0];

    return (
      <View style={styles.item}>
        <View style={styles.itemContent}>
          <Text style={styles.emoji}>{todoItem.emoji}</Text>
          <Text style={styles.title}>{todoItem.title}</Text>
        </View>
      </View>
    );
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.listContainer}>
        <SortableList
          data={items}
          listItemHeight={LIST_ITEM_HEIGHT}
          onDragEnd={onDragEnd}
          renderItem={renderItem}
          backgroundItem={<View style={styles.backgroundItem} />}
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  backgroundItem: {
    backgroundColor: '#f8f8f8',
    borderColor: '#e0e0e0',
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    marginHorizontal: 4,
  },
  container: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 24,
    marginRight: 12,
  },
  item: {
    alignSelf: 'center',
    height: LIST_ITEM_HEIGHT,
    paddingHorizontal: 4,
    paddingVertical: 4,
    width: '80%',
  },
  itemContent: {
    alignItems: 'center',
    backgroundColor: '#f7f7f7',
    borderColor: '#f0f0f0',
    borderCurve: 'continuous',
    borderRadius: 8,
    borderWidth: 1,
    elevation: 5,
    flex: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.01,
    shadowRadius: 10,
  },
  listContainer: {
    borderCurve: 'continuous',
    borderRadius: 12,
    height: LIST_ITEM_HEIGHT * 4,
    width: '100%',
  },
  title: {
    color: '#333333',
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
  },
});

import { StyleSheet, View } from 'react-native';

import { type FC, memo, useCallback, useState } from 'react';

import { Entypo } from '@expo/vector-icons';
import { PressableGlass } from 'pressto/glass';

import { BlurredList } from './components/blurred-list';
import { ListItem } from './components/list-item';
import { generateRandomItem, type Item } from './utils/generate-random-item';

const AddButton: FC<{ onPress: () => void }> = memo(({ onPress }) => (
  <PressableGlass onPress={onPress} style={styles.addButton}>
    <Entypo name="plus" size={40} color="white" />
  </PressableGlass>
));

const App = () => {
  const [items, setItems] = useState<Item[]>([]);

  const addItem = useCallback(() => {
    setItems(prevItems => [
      ...prevItems,
      {
        ...generateRandomItem(prevItems.length + 1),
      },
    ]);
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.listContainer}>
        <BlurredList
          data={items}
          renderItem={({ item }) => <ListItem item={item} />}
          maxVisibleItems={3}
        />
        <View style={styles.buttonContainer}>
          <AddButton onPress={addItem} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  addButton: {
    alignItems: 'center',
    backgroundColor: 'black',
    borderCurve: 'continuous',
    borderRadius: 32,
    height: 64,
    justifyContent: 'center',
    width: 64,
  },
  buttonContainer: {
    alignItems: 'center',
    top: -50,
  },
  container: {
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  listContainer: {
    flex: 1,
    justifyContent: 'center',
  },
});

export { App };

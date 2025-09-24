import { Entypo } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { type FC, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BlurredList } from './components/blurred-list';
import { ListItem } from './components/list-item';
import { generateRandomItem, type Item } from './utils/generate-random-item';

const AddButton: FC<{ onPress: () => void }> = ({ onPress }) => (
  <PressableScale onPress={onPress} style={styles.addButton}>
    <Entypo name="plus" size={40} color="white" />
  </PressableScale>
);

// Main App Component
const App = () => {
  const [items, setItems] = useState<Item[]>([]);

  const addItem = () => {
    setItems(prevItems => [
      ...prevItems,
      {
        ...generateRandomItem(prevItems.length + 1),
      },
    ]);
  };

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
  container: {
    flex: 1,
    backgroundColor: '#fff',
    justifyContent: 'center',
  },
  listContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  addButton: {
    width: 64,
    height: 64,
    backgroundColor: 'black',
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonContainer: {
    alignItems: 'center',
    top: -50,
  },
});

export { App };

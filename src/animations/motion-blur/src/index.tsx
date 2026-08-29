import { StyleSheet, Text, View } from 'react-native';

import { type FC, memo, useCallback, useState } from 'react';

import { Entypo } from '@expo/vector-icons';
// @@TODO: restore once available in pressto
// import { PressableGlass } from 'pressto/glass';
import { PressableScale } from 'pressto';

import { BlurredList } from './components/blurred-list';
import { ListItem } from './components/list-item';
import { generateRandomItem, type Item } from './utils/generate-random-item';

const AddButton: FC<{ onPress: () => void }> = memo(({ onPress }) => (
  <PressableScale
    testID="motion-blur-add"
    onPress={onPress}
    style={styles.addButton}>
    <Entypo name="plus" size={40} color="white" />
  </PressableScale>
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
      {/* e2e outcome probe: exposes the live item count so a test can verify
          the Add button actually inserted items. Visually negligible. */}
      <Text testID="motion-blur-status" style={styles.statusProbe}>
        {`items:${items.length}`}
      </Text>
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
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    opacity: 0.012,
  },
});

export { App };

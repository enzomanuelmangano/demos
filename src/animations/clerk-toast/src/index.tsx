import { ScrollView, StyleSheet, View } from 'react-native';
import { PressableScale } from 'pressto';

import { useDemoStackedToast } from './hook';

const App = () => {
  const { onPress } = useDemoStackedToast();

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 60,
        }}>
        {new Array(10).fill(null).map((_, index) => (
          <PressableScale
            key={index}
            onPress={onPress}
            style={styles.listItem}
          />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fefefe',
  },
  listItem: {
    height: 100,
    backgroundColor: 'black',
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 20,
    borderCurve: 'continuous',
  },
});

// Export the main App component for use in other files
export { App };

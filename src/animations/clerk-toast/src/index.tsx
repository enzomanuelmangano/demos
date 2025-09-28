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
    backgroundColor: '#fefefe',
    flex: 1,
  },
  listItem: {
    backgroundColor: 'black',
    borderCurve: 'continuous',
    borderRadius: 20,
    height: 100,
    marginHorizontal: 20,
    marginVertical: 10,
  },
});

export { App };

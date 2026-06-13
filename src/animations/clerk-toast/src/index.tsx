import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

// @@TODO: restore once available in pressto
// import { PressableGlass } from 'pressto/glass';
import { PressableScale } from 'pressto';
import { ScrollView } from 'react-native-gesture-handler';

import { useDemoStackedToast } from './hook';

const App = () => {
  const { onPress } = useDemoStackedToast();

  // e2e outcome probe: counts how many toasts have been spawned so a test can
  // assert tapping a card actually showed a toast. Near-invisible.
  const [toastCount, setToastCount] = useState(0);

  const handlePress = () => {
    onPress();
    setToastCount(count => count + 1);
  };

  return (
    <View style={styles.container}>
      <Text testID="clerk-toast-status" style={styles.statusProbe}>
        {`toasts:${toastCount}`}
      </Text>
      <ScrollView
        contentContainerStyle={{
          paddingTop: 60,
        }}>
        {new Array(10).fill(null).map((_, index) => (
          <PressableScale
            key={index}
            testID={`clerk-toast-item-${index}`}
            onPress={handlePress}
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
  // Near-invisible to the eye, but on-screen for the e2e accessibility tree.
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#808080',
    opacity: 0.012,
    zIndex: 1000,
  },
});

export { App };

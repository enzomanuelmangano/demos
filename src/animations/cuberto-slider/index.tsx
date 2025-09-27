import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Slider } from './components/slider';

const App = () => {
  return (
    <View style={styles.container}>
      <Slider />
    </View>
  );
};

export const CubertoSlider = memo(() => {
  return (
    <GestureHandlerRootView style={styles.fill}>
      <App />
    </GestureHandlerRootView>
  );
});

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

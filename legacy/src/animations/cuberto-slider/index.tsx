import { StyleSheet, View } from 'react-native';

import { memo } from 'react';

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
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  fill: {
    flex: 1,
  },
});

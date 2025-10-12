// Import necessary modules and components from React Native and other libraries
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from 'pressto';

import { useDemoStackedSheet } from './hook';

const App = () => {
  const { onPress } = useDemoStackedSheet();

  return (
    <View style={styles.container}>
      <PressableScale style={styles.button} onPress={onPress}>
        <Text style={styles.textButton}>Show stacked tray</Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#111',
    borderCurve: 'continuous',
    borderRadius: 25,
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 25,
    paddingVertical: 18,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#fefefe',
    flex: 1,
    justifyContent: 'center',
  },
  textButton: {
    borderCurve: 'continuous',
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

export { App };

// Import necessary modules and components from React Native and other libraries
import { StyleSheet, Text, View } from 'react-native';

import { PressableScale } from 'pressto';

import { useDemoStackedSheet } from './hook';

// Define the main component of the application
const App = () => {
  const { onPress } = useDemoStackedSheet();

  // Render the main view of the application
  return (
    <View style={styles.container}>
      {/* Create a button using the PressableScale component */}
      <PressableScale style={styles.button} onPress={onPress}>
        {/* Text displayed on the button */}
        <Text style={styles.textButton}>Show Action Tray</Text>
      </PressableScale>
    </View>
  );
};

// Define the styles for the components using StyleSheet.create
const styles = StyleSheet.create({
  button: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    backgroundColor: '#111',
    borderRadius: 25,
    marginBottom: 20,
    borderCurve: 'continuous', // Note: 'borderCurve' is not a valid property, perhaps 'borderRadius' is intended
    borderWidth: 1,
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

// Export the main App component for use in other files
export { App };

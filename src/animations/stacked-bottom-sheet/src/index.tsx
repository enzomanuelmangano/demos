// Import necessary modules and components from React Native and other libraries
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { PressableScale } from 'pressto';

import { useDemoStackedSheet } from './hook';

// Define the main component of the application
const App = () => {
  // The code
  const { onPress } = useDemoStackedSheet();

  // Render the main view of the application
  return (
    <View style={styles.container}>
      {/* Display the status bar */}
      <StatusBar style="auto" />

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
  container: {
    flex: 1,
    backgroundColor: '#fefefe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    paddingVertical: 18,
    paddingHorizontal: 25,
    backgroundColor: '#111',
    borderRadius: 25,
    marginBottom: 20,
    borderCurve: 'continuous', // Note: 'borderCurve' is not a valid property, perhaps 'borderRadius' is intended
    borderWidth: 1,
  },
  textButton: {
    color: 'white',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
    borderCurve: 'continuous',
    fontFamily: 'SF-Pro-Rounded-Bold',
  },
});

// Export the main App component for use in other files
export { App };

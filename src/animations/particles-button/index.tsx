/**
 * Main Application Component
 *
 * A demo application showcasing the CircularButton component with a blast effect animation.
 * The app displays a centered circular button on a dark background that triggers
 * a particle blast effect when pressed.
 *
 * @component
 */

import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CircularButton } from './components/circular-button';

// Configuration constants for the button
const buttonSize = 48;
const blastRadius = buttonSize;

/**
 * Main App component that renders the demo interface
 */
export const ParticlesButton = () => {
  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <CircularButton
        blastRadius={blastRadius}
        size={buttonSize}
        onPress={() => {
          console.log('pressed :)');
        }}
      />
    </View>
  );
};

/**
 * Styles for the main container
 */
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

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

import { CircularButton } from './components/circular-button';

const buttonSize = 48;
const blastRadius = buttonSize * 2;

/**
 * Main App component that renders the demo interface
 */
export const ParticlesButton = () => {
  return (
    <View style={styles.container}>
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
    alignItems: 'center',
    backgroundColor: '#111',
    flex: 1,
    justifyContent: 'center',
  },
});

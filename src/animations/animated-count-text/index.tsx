import { Entypo } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { AnimatedCount } from './components/animated-count';

// Function to generate a random number with a given number of digits
function getRandomNumber(digits: number): number {
  // Calculate the minimum and maximum possible values based on the number of digits
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;

  // Generate a random number within the specified range
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const AnimatedCountText = () => {
  // State to hold the current number
  const [number, setNumber] = useState(1);

  return (
    <View style={styles.container}>
      {/* AnimatedCount component to display the animated number */}
      <AnimatedCount number={number} />

      {/* TouchableOpacity for the floating bottom button */}
      <TouchableOpacity
        style={styles.floatingBottomButton}
        onPress={() => {
          // Generate a random number with a random number of digits (1 to 6)
          const num = getRandomNumber(Math.floor(6 * Math.random() + 1));

          // Update the state with the generated number
          setNumber(num);
        }}>
        <Entypo name="shuffle" size={24} color="black" />
      </TouchableOpacity>
    </View>
  );
};

// Styles for the components
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBottomButton: {
    position: 'absolute',
    bottom: 80,
    right: 30,
    backgroundColor: 'white',
    height: 64,
    aspectRatio: 1,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

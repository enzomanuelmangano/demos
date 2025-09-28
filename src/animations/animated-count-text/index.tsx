import { Entypo } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { AnimatedCount } from './components/animated-count';

function getRandomNumber(digits: number): number {
  const min = Math.pow(10, digits - 1);
  const max = Math.pow(10, digits) - 1;

  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const AnimatedCountText = () => {
  const [number, setNumber] = useState(1);

  return (
    <View style={styles.container}>
      <AnimatedCount number={number} />

      <TouchableOpacity
        style={styles.floatingBottomButton}
        onPress={() => {
          const num = getRandomNumber(Math.floor(6 * Math.random() + 1));

          setNumber(num);
        }}>
        <Entypo name="shuffle" size={24} color="black" />
      </TouchableOpacity>
    </View>
  );
};

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

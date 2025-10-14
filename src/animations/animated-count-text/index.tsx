import { StyleSheet, View } from 'react-native';

import { useState } from 'react';

import { Entypo } from '@expo/vector-icons';
import { PressableScale } from 'pressto';

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

      <PressableScale
        style={styles.floatingBottomButton}
        onPress={() => {
          const num = getRandomNumber(Math.floor(6 * Math.random() + 1));

          setNumber(num);
        }}>
        <Entypo name="shuffle" size={24} color="black" />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000',
    flex: 1,
    justifyContent: 'center',
  },
  floatingBottomButton: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 32,
    bottom: 80,
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    right: 30,
  },
});

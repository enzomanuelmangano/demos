import { StyleSheet, Text, View } from 'react-native';

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
  // e2e outcome probe: counts how many times the count was re-rolled so a test
  // can assert the shuffle FAB actually drove a new value. Visually negligible.
  const [rolls, setRolls] = useState(0);

  return (
    <View style={styles.container}>
      <Text testID="animated-count-text-status" style={styles.statusProbe}>
        {`rolled:${rolls}`}
      </Text>
      <AnimatedCount number={number} />

      <PressableScale
        testID="animated-count-text-shuffle"
        style={styles.floatingBottomButton}
        onPress={() => {
          const num = getRandomNumber(Math.floor(6 * Math.random() + 1));

          setNumber(num);
          setRolls(r => r + 1);
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
    borderRadius: 32,
    bottom: 80,
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    right: 30,
  },
  // Near-invisible to the eye, but on-screen + opaque enough for the
  // accessibility/view tree to expose it to e2e (alpha >= 0.01).
  statusProbe: {
    color: '#fff',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
});

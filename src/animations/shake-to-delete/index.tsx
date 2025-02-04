import React from 'react';
import { StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { AppsList } from './apps-list';

const ShakeToDeleteAnimation = () => {
  return (
    <>
      <LinearGradient
        colors={['#000000', '#121212']}
        style={styles.background}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
      />
      <AppsList />
    </>
  );
};

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
});

export { ShakeToDeleteAnimation };

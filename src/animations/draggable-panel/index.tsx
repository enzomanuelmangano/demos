import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SpringAnimationPanel } from './components/spring-animation-panel';

const DraggablePanel = () => {
  return (
    <GestureHandlerRootView style={styles.container}>
      <StatusBar style="dark" />
      <SpringAnimationPanel />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
});

export { DraggablePanel };

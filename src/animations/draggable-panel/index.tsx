import { StyleSheet } from 'react-native';

import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { SpringAnimationPanel } from './components/spring-animation-panel';

const DraggablePanel = () => {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SpringAnimationPanel />
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f5f7fa',
    flex: 1,
  },
});

export { DraggablePanel };

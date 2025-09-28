import { StyleSheet, View } from 'react-native';

import { PressableScale } from 'pressto';

import { useDemoStackedModal } from './hook';
import { StackedModalProvider } from './stacked-modal-manager';

const StackedModals = () => {
  const { onPress } = useDemoStackedModal();

  return (
    <View style={styles.container}>
      <PressableScale onPress={onPress} style={styles.button} />
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    aspectRatio: 1,
    backgroundColor: 'black',
    borderCurve: 'continuous',
    borderRadius: 32,
    bottom: 48,
    height: 64,
    marginHorizontal: 20,
    position: 'absolute',
    right: 20,
  },
  container: {
    backgroundColor: '#fefefe',
    flex: 1,
  },
});

const StackedModalsContainer = () => {
  return (
    <StackedModalProvider>
      <StackedModals />
    </StackedModalProvider>
  );
};

export { StackedModalsContainer as StackedModals };

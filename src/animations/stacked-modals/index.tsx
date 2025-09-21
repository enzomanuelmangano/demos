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
  container: {
    flex: 1,
    backgroundColor: '#fefefe',
  },
  button: {
    height: 64,
    aspectRatio: 1,
    borderRadius: 32,
    backgroundColor: 'black',
    marginHorizontal: 20,
    borderCurve: 'continuous',
    position: 'absolute',
    bottom: 48,
    right: 20,
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

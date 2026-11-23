import { StyleSheet, View } from 'react-native';

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';

import { useDemoStackedModal } from './hook';
import { StackedModalProvider } from './stacked-modal-manager';

const StackedModals = () => {
  const { onPress } = useDemoStackedModal();

  return (
    <View style={styles.container}>
      <PressableScale onPress={onPress} style={styles.button}>
        <Ionicons name="add" size={28} color="white" />
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    aspectRatio: 1,
    backgroundColor: 'black',
    borderRadius: 32,
    bottom: 48,
    height: 64,
    justifyContent: 'center',
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

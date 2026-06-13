import { StyleSheet, Text, View } from 'react-native';

import { useContext } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';

import { useDemoStackedModal } from './hook';
import {
  InternalStackedModalContext,
  StackedModalProvider,
} from './stacked-modal-manager';

const StackedModals = () => {
  const { onPress } = useDemoStackedModal();

  // e2e outcome probe: exposes how many modals are currently stacked so a test
  // can verify the trigger/confirm flow actually pushed them. Visually
  // negligible.
  const { stackedModals } = useContext(InternalStackedModalContext);

  return (
    <View style={styles.container}>
      <Text testID="stacked-modals-status" style={styles.statusProbe}>
        {`count:${stackedModals.length}`}
      </Text>
      <PressableScale
        testID="stacked-modals-trigger"
        onPress={onPress}
        style={styles.button}>
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
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    opacity: 0.012,
    zIndex: 9999,
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

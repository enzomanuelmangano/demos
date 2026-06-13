import { StyleSheet, Text, View } from 'react-native';

import { useState } from 'react';

import { DeleteButton } from './components/delete-button';

const App = () => {
  // e2e outcome probe: exposes whether the gooey delete was actually confirmed
  // (the button is rendered entirely in Skia, so its state is otherwise
  // un-inspectable). Visually negligible.
  const [status, setStatus] = useState<'idle' | 'deleted'>('idle');

  return (
    <View style={styles.container}>
      <Text testID="delete-button-status" style={styles.statusProbe}>
        {status}
      </Text>
      <View testID="delete-button">
        <DeleteButton
          onConfirmDeletion={() => setStatus('deleted')}
          height={50}
          width={150}
          additionalWidth={80}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#fff',
    flex: 1,
    justifyContent: 'center',
  },
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    opacity: 0.012,
  },
});

export { App };

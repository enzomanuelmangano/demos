// Import necessary modules and components from React Native and other libraries
import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useState } from 'react';

import { PressableScale } from 'pressto';

import { useDemoStackedSheet } from './hook';

const App = () => {
  const { onPress } = useDemoStackedSheet();

  // e2e outcome probe: the sheet is presented through a portal/overlay manager
  // with no inspectable RN state on this screen, so we latch "shown" once the
  // trigger fires to prove a sheet was actually presented. Near-invisible
  // (alpha ~0.01).
  const [status, setStatus] = useState<'idle' | 'shown'>('idle');
  const onPressWithProbe = useCallback(() => {
    setStatus('shown');
    onPress();
  }, [onPress]);

  return (
    <View style={styles.container}>
      <Text testID="stacked-bottom-sheet-status" style={styles.statusProbe}>
        {status}
      </Text>
      <PressableScale
        testID="stacked-bottom-sheet-show"
        style={styles.button}
        onPress={onPressWithProbe}>
        <Text style={styles.textButton}>Show stacked tray</Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#111',
    borderCurve: 'continuous',
    borderRadius: 25,
    borderWidth: 1,
    marginBottom: 20,
    paddingHorizontal: 25,
    paddingVertical: 18,
  },
  container: {
    alignItems: 'center',
    backgroundColor: '#fefefe',
    flex: 1,
    justifyContent: 'center',
  },
  statusProbe: {
    color: '#000',
    fontSize: 1,
    left: 0,
    opacity: 0.012,
    position: 'absolute',
    top: 0,
  },
  textButton: {
    borderCurve: 'continuous',
    color: 'white',
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});

export { App };

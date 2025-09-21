import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { ButtonsGrid } from './components/buttons-grid';
import { AnimatedNumber } from './components/animated-number';

const NumberInput: React.FC = () => {
  const [input, updateInput] = useState<number>(0);
  const insets = useSafeAreaInsets();

  const reset = useCallback(() => {
    updateInput(0);
  }, []);

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}>
      <View style={styles.fillCenter}>
        <View
          style={[
            styles.fillCenter,
            {
              paddingTop: 50,
            },
          ]}>
          <AnimatedNumber value={input} />
        </View>
        <LinearGradient
          colors={['transparent', '#000', '#000', '#000']}
          style={styles.gradient}
        />
      </View>
      <View style={styles.fill}>
        <ButtonsGrid
          input={input}
          onUpdate={updateInput}
          onBackspace={updateInput}
          onReset={reset}
          onMaxReached={() => {
            // I'm not handling this logic.
            // My idea was to use burnt toast to show a message to the user.
            // Package: https://github.com/nandorojo/burnt
            // It required the "prebuild" (So it wouldn't work on Expo Go)
            // But feel free to use it in your projects :)
            // Burnt.toast('Error!', 'Max input reached.');
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  gradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
  },
  fill: {
    flex: 1,
  },
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { NumberInput };

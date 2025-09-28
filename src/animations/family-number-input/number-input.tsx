import { StyleSheet, View } from 'react-native';

import { type FC, useCallback, useState } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedNumber } from './components/animated-number';
import { ButtonsGrid } from './components/buttons-grid';

const NumberInput: FC = () => {
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
    backgroundColor: '#000',
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  fillCenter: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  gradient: {
    bottom: 0,
    height: '50%',
    left: 0,
    position: 'absolute',
    right: 0,
  },
});

export { NumberInput };

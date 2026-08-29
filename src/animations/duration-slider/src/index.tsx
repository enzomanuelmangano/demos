import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import { useFont } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';

import { CircularSlider } from './components/circular-slider';
// @ts-ignore
import sfProRoundedBold from '../../../../assets/fonts/SF-Pro-Rounded-Bold.otf';

const App = () => {
  const { width: windowWidth } = useWindowDimensions();
  const size = windowWidth * 0.8;

  const font = useFont(sfProRoundedBold, 100);

  // e2e outcome probe: flips to "moved" once the ring value actually changes,
  // so a test can verify the drag drove the slider (the value lives in Skia and
  // is otherwise un-inspectable). Visually negligible.
  const [status, setStatus] = useState<'idle' | 'moved'>('idle');

  return (
    <View style={styles.container}>
      <Text testID="duration-slider-status" style={styles.statusProbe}>
        {status}
      </Text>
      {font && (
        <View testID="duration-slider-knob">
          <CircularSlider
            minVal={1}
            maxVal={12}
            onValueChange={value => {
              console.log({ value });
              setStatus('moved');
              Haptics.selectionAsync();
            }}
            width={size}
            height={size}
            font={font}
          />
        </View>
      )}
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

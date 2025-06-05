import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AtlasButton as AtlasButtonComponent } from './atlas-button';

// --- CONSTANTS ---
// Inspiration https://x.com/i/status/1734891084826952094

const CanvasWidth = 250;
const CanvasHeight = 200;

// Why Float32Array? Under the hood the AtlasButton uses the <Atlas/> component from react-native-skia
// Which accepts just an array of Float32Array colors for the squares. This is the format for the colors.
const TRANSPARENT = new Float32Array([0, 0, 0, 1]);
const BLUE = new Float32Array([0, 0.2, 1, 0.8]);
const LIGHT_BLUE = new Float32Array([0, 0.5, 1, 0.8]);
const BLUE_VARIANT = new Float32Array([0.3, 0.2, 1, 0.8]);

// Why are we repeating the colors?
// To increase the probability of the colors being picked
// We might want to have a higher chance of some colors being picked than others
const colors = [
  TRANSPARENT,
  TRANSPARENT,
  TRANSPARENT,
  LIGHT_BLUE,
  LIGHT_BLUE,
  BLUE,
  BLUE_VARIANT,
];

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactNativeSvg = require('./assets/header_logo.svg');

export function AtlasButton() {
  return (
    <View style={styles.container}>
      <AtlasButtonComponent
        width={CanvasWidth}
        height={CanvasHeight}
        label="React Native"
        svgIcon={ReactNativeSvg}
        colors={colors}
        horizontalSquaresAmount={50}
        onPress={() => {
          console.log('Button pressed');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
  },
});

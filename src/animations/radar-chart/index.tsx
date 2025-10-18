import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useState } from 'react';

import { useFont } from '@shopify/react-native-skia';
import { PressableScale } from 'pressto';

import { RadarChart } from './components/radar-chart';

import type { RadarDataType } from './components/radar-chart';

type RadarKeys = 'Checkmate' | 'Deflection' | 'Endgame' | 'Fork' | 'Sacrifice';

const generateRandomDataChart = () => {
  const keys: RadarKeys[] = [
    'Checkmate',
    'Deflection',
    'Endgame',
    'Fork',
    'Sacrifice',
  ];

  return [
    {
      color: 'rgba(255,255,0,0.2)',
      values: keys.reduce((acc, curr) => {
        return { [curr]: (Math.random() * 100) / 100, ...acc };
      }, {}),
    },
    {
      color: 'rgba(0,255,255,0.3)',
      values: keys.reduce((acc, curr) => {
        return { [curr]: (Math.random() * 100) / 100, ...acc };
      }, {}),
    },
  ] as RadarDataType<RadarKeys>;
};

// Data Example:
// [{
//   color: 'rgba(255,255,0,0.2)',
//   values: {
//     Checkmate: 1,
//     Deflection: 0.6,
//     Endgame: 0.1,
//     Fork: 0.1,
//     Sacrifice: 0.5,
//   },
// },
// {
//   color: 'rgba(0,255,255,0.3)',
//   values: {
//     Checkmate: 0.2,
//     Deflection: 0.1,
//     Endgame: 0.5,
//     Fork: 0.9,
//     Sacrifice: 0.8,
//   },
// }]

export const RadarChartContainer = () => {
  const [data, setData] = useState(generateRandomDataChart);

  const font = useFont(
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('../../../assets/fonts/outfit.ttf'),
    16,
  );

  const { width } = useWindowDimensions();

  return (
    <View style={styles.container}>
      <RadarChart
        data={data}
        showGrid={true}
        font={font}
        internalLayers={5}
        strokeWidth={2}
        strokeColor="rgba(255,255,255,0.5)"
        style={{ width: width, aspectRatio: 1 }}
      />
      <PressableScale
        onPress={() => {
          setData(generateRandomDataChart());
        }}
        style={styles.button}>
        <Text style={styles.title}>Shuffle</Text>
      </PressableScale>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderColor: 'white',
    borderCurve: 'continuous',
    borderRadius: 20,
    borderWidth: 1,
    height: 60,
    justifyContent: 'center',
    marginTop: 50,
    width: '80%',
  },
  container: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  title: {
    color: 'white',
    fontSize: 20,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

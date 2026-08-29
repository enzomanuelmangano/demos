import { StyleSheet, Text, View } from 'react-native';

import { useCallback, useRef, useState } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { PressableScale } from 'pressto';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import NoneMatrix from '../find-weights/examples/none.json';
import ModelWeights from '../find-weights/model_weights.json';
import * as nn from '../neural-network';
import { Grid } from './grid';
import { NeuralNetwork } from './network';
import { Predictions } from './predictions';

import type { PredictResult } from '../neural-network';
import type { GridHandleRef } from './grid';

const {
  weight_0: inputLayerWeights,
  weight_1: inputLayerBias,
  weight_2: hiddenLayerWeights,
  weight_3: hiddenLayerBias,
  weight_4: outputLayerWeights,
  weight_5: outputLayerBias,
} = ModelWeights;

const ModelWeightsFlat = {
  inputLayerWeights: inputLayerWeights,
  inputLayerBias: inputLayerBias,
  hiddenLayerWeights: hiddenLayerWeights,
  hiddenLayerBias: hiddenLayerBias,
  outputLayerWeights: outputLayerWeights,
  outputLayerBias: outputLayerBias,
};

function App() {
  const predictions = useSharedValue<PredictResult>(
    nn.predict(ModelWeightsFlat, NoneMatrix.matrix),
  );

  // e2e outcome probe: flips to "drawn" once any cell is painted on the Skia
  // canvas, so a test can verify the drag actually drew a digit (the canvas
  // state is otherwise un-inspectable). Visually negligible.
  const [status, setStatus] = useState<'idle' | 'drawn'>('idle');

  const onUpdate = useCallback(
    (squaresGrid: number[][]) => {
      'worklet';

      let painted = false;
      for (let i = 0; i < squaresGrid.length; i++) {
        for (let j = 0; j < squaresGrid[i].length; j++) {
          if (squaresGrid[i][j] === 1) {
            painted = true;
            break;
          }
        }
        if (painted) break;
      }
      if (painted) {
        scheduleOnRN(setStatus, 'drawn');
      }

      const result = nn.predict(ModelWeightsFlat, squaresGrid);
      predictions.set(result);
    },
    [predictions],
  );

  const gridRef = useRef<GridHandleRef>(null);

  const finalOutput = useDerivedValue(() => predictions.get().finalOutput);

  return (
    <View style={styles.container}>
      <Text testID="mnist-status" style={styles.statusProbe}>
        {status}
      </Text>
      <StatusBar style="light" />
      <View style={styles.fillCenter}>
        <NeuralNetwork weights={ModelWeightsFlat} predictions={predictions} />
        <Predictions finalOutput={finalOutput} />
      </View>
      <View testID="mnist-canvas" style={styles.fill}>
        <Grid ref={gridRef} onUpdate={onUpdate} />
      </View>

      <PressableScale
        testID="mnist-clear"
        style={styles.floatingButton}
        onPress={() => {
          gridRef.current?.clear();
        }}>
        <MaterialCommunityIcons name="eraser" size={28} color="#fff" />
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: '#000000',
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  fillCenter: {
    flex: 1,
    justifyContent: 'center',
  },
  floatingButton: {
    alignItems: 'center',
    backgroundColor: '#111',
    borderRadius: 32,
    bottom: 40,
    boxShadow: '0px 0px 32px rgba(255, 255, 255, 0.1)',
    height: 64,
    justifyContent: 'center',
    position: 'absolute',
    right: 40,
    width: 64,
  },
  statusProbe: {
    position: 'absolute',
    top: 0,
    left: 0,
    fontSize: 1,
    color: '#fff',
    opacity: 0.012,
    zIndex: 9999,
  },
});

export { App as Mnist };

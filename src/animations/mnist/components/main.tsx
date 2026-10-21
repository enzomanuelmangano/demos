import { StyleSheet, View } from 'react-native';

import { useCallback, useRef } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { PressableScale } from 'pressto';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

import NoneMatrix from '../find-weights/examples/none.json';
import * as nn from '../neural-network';
import { Grid } from './grid';
import { NeuralNetwork } from './network';
import { Predictions } from './predictions';

import type { NeuralNetworkWeights, PredictResult } from '../neural-network';
import type { GridHandleRef } from './grid';

type ModelWeightsJson = {
  weight_0: number[][];
  weight_1: number[];
  weight_2: number[][];
  weight_3: number[];
  weight_4: number[][];
  weight_5: number[];
};

let cachedModel:
  | { weights: NeuralNetworkWeights; initialPrediction: PredictResult }
  | undefined;

// The weights file is 1.1MB of JSON and the registry imports every demo at
// launch, so it is parsed on the demo's first mount instead of at startup.
const getModel = () => {
  if (!cachedModel) {
    const {
      weight_0: inputLayerWeights,
      weight_1: inputLayerBias,
      weight_2: hiddenLayerWeights,
      weight_3: hiddenLayerBias,
      weight_4: outputLayerWeights,
      weight_5: outputLayerBias,
    } = require('../find-weights/model_weights.json') as ModelWeightsJson;
    const weights: NeuralNetworkWeights = {
      inputLayerWeights,
      inputLayerBias,
      hiddenLayerWeights,
      hiddenLayerBias,
      outputLayerWeights,
      outputLayerBias,
    };
    cachedModel = {
      weights,
      initialPrediction: nn.predict(weights, NoneMatrix.matrix),
    };
  }
  return cachedModel;
};

function App() {
  const { weights, initialPrediction } = getModel();
  const predictions = useSharedValue<PredictResult>(initialPrediction);

  const onUpdate = useCallback(
    (squaresGrid: number[][]) => {
      'worklet';

      const result = nn.predict(weights, squaresGrid);
      predictions.set(result);
    },
    [predictions, weights],
  );

  const gridRef = useRef<GridHandleRef>(null);

  const finalOutput = useDerivedValue(() => predictions.get().finalOutput);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.fillCenter}>
        <NeuralNetwork weights={weights} predictions={predictions} />
        <Predictions finalOutput={finalOutput} />
      </View>
      <View style={styles.fill}>
        <Grid ref={gridRef} onUpdate={onUpdate} />
      </View>

      <PressableScale
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
});

export { App as Mnist };

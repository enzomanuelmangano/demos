import { StyleSheet, View } from 'react-native';

import { useCallback, useRef } from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { PressableScale } from 'pressto';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';

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

  const onUpdate = useCallback(
    (squaresGrid: number[][]) => {
      'worklet';

      const result = nn.predict(ModelWeightsFlat, squaresGrid);
      predictions.value = result;
    },
    [predictions],
  );

  const gridRef = useRef<GridHandleRef>(null);

  const finalOutput = useDerivedValue(() => predictions.value.finalOutput);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.fillCenter}>
        <NeuralNetwork weights={ModelWeightsFlat} predictions={predictions} />
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

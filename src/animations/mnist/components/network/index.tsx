/* eslint-disable react-hooks/rules-of-hooks */
import { useWindowDimensions, View } from 'react-native';

import { useMemo } from 'react';

import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useDerivedValue } from 'react-native-reanimated';

import { NetworkNode } from './node';

import type { NeuralNetworkWeights, PredictResult } from '../../neural-network';
import type { SkPath } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

type NeuralNetworkProps = {
  weights: NeuralNetworkWeights;
  predictions: SharedValue<PredictResult>;
};

const NetworkLayer = ({
  coords,
  getOpacity,
}: {
  coords: Array<{ x: number; y: number }>;
  getOpacity: (index: number) => SharedValue<number>;
}) => {
  return coords.map((coord, i) => (
    <NetworkNode key={coord.x} coord={coord} opacity={getOpacity(i)} />
  ));
};

// Helper functions
const drawLayerConnections = ({
  fromCoords,
  toCoords,
  layerWeights,
  path,
  weightThreshold,
  type,
}: {
  fromCoords: Array<{ x: number; y: number }>;
  toCoords: Array<{ x: number; y: number }>;
  layerWeights: number[][];
  path: SkPath;
  weightThreshold: number;
  type: 'positive' | 'negative';
}) => {
  fromCoords.forEach((fromNode, i) => {
    toCoords.forEach((toNode, j) => {
      const weight = layerWeights[i][j];
      if (
        (weight > 0 && type === 'negative') ||
        (weight < 0 && type === 'positive') ||
        Math.abs(weight) < weightThreshold
      ) {
        return;
      }
      path.moveTo(fromNode.x, fromNode.y);
      path.lineTo(toNode.x, toNode.y);
    });
  });
};

const useLayerCoordinates = (
  width: number,
  weights: NeuralNetworkWeights,
  predictions: SharedValue<PredictResult>,
) => {
  const marginLayers = 7;
  const distanceBetweenLayers = 100;
  const baseY = 20;

  const firstLayerCoords = useMemo(() => {
    const layer = weights.hiddenLayerWeights;
    const totalWidth = layer.length * marginLayers;
    const paddingHorizontal = (width - totalWidth) / 2;
    return layer.map((_, i) => ({
      x: i * marginLayers + paddingHorizontal,
      y: baseY,
    }));
  }, [weights, width]);

  const secondLayerCoords = useMemo(() => {
    const layer = weights.outputLayerWeights;
    const totalWidth = layer.length * marginLayers;
    const paddingHorizontal = (width - totalWidth) / 2;
    return layer.map((_, i) => ({
      x: i * marginLayers + paddingHorizontal,
      y: baseY + distanceBetweenLayers,
    }));
  }, [weights, width]);

  const outputLayerCoords = useMemo(() => {
    const layer3 = predictions.value.finalOutput;
    const layer2 = weights.outputLayerWeights;
    const totalWidth = layer2.length * marginLayers;
    const paddingHorizontal = (width - totalWidth) / 2;
    return layer3.map((_, i) => ({
      x:
        i * marginLayers +
        paddingHorizontal +
        ((layer2.length - layer3.length) * marginLayers) / 2,
      y: baseY + distanceBetweenLayers * 2,
    }));
  }, [predictions, weights, width]);

  return {
    firstLayerCoords,
    secondLayerCoords,
    outputLayerCoords,
    dimensions: {
      distanceBetweenLayers,
      baseY,
    },
  };
};

// Main component
export const NeuralNetwork = ({ weights, predictions }: NeuralNetworkProps) => {
  const { width } = useWindowDimensions();
  const WEIGHT_THRESHOLD = 0.35;

  const { firstLayerCoords, secondLayerCoords, outputLayerCoords, dimensions } =
    useLayerCoordinates(width, weights, predictions);

  const positiveWeightLines = useMemo(() => {
    const skPath = Skia.Path.Make();
    drawLayerConnections({
      fromCoords: firstLayerCoords,
      toCoords: secondLayerCoords,
      layerWeights: weights.hiddenLayerWeights,
      path: skPath,
      weightThreshold: WEIGHT_THRESHOLD,
      type: 'positive',
    });
    drawLayerConnections({
      fromCoords: secondLayerCoords,
      toCoords: outputLayerCoords,
      layerWeights: weights.outputLayerWeights,
      path: skPath,
      weightThreshold: WEIGHT_THRESHOLD,
      type: 'positive',
    });
    return skPath;
  }, [firstLayerCoords, secondLayerCoords, outputLayerCoords, weights]);

  const negativeWeightLines = useMemo(() => {
    const skPath = Skia.Path.Make();
    drawLayerConnections({
      fromCoords: firstLayerCoords,
      toCoords: secondLayerCoords,
      layerWeights: weights.hiddenLayerWeights,
      path: skPath,
      weightThreshold: WEIGHT_THRESHOLD,
      type: 'negative',
    });
    drawLayerConnections({
      fromCoords: secondLayerCoords,
      toCoords: outputLayerCoords,
      layerWeights: weights.outputLayerWeights,
      path: skPath,
      weightThreshold: WEIGHT_THRESHOLD,
      type: 'negative',
    });
    return skPath;
  }, [firstLayerCoords, secondLayerCoords, outputLayerCoords, weights]);

  return (
    <View>
      <Canvas
        style={{
          width,
          height: dimensions.distanceBetweenLayers * 2 + dimensions.baseY * 2,
        }}>
        <Path
          path={positiveWeightLines}
          color={'blue'}
          style="stroke"
          opacity={0.5}
        />
        <Path
          path={negativeWeightLines}
          opacity={0.5}
          color={'red'}
          style="stroke"
        />
        <NetworkLayer
          coords={firstLayerCoords}
          getOpacity={i =>
            useDerivedValue(() => predictions.value.hidden1Output[i])
          }
        />
        <NetworkLayer
          coords={secondLayerCoords}
          getOpacity={i =>
            useDerivedValue(() => predictions.value.hidden2Output[i])
          }
        />
        <NetworkLayer
          coords={outputLayerCoords}
          getOpacity={i =>
            useDerivedValue(() => predictions.value.finalOutput[i])
          }
        />
      </Canvas>
    </View>
  );
};

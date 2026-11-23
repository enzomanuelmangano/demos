export type NeuralNetworkWeights = {
  inputLayerWeights: number[][];
  inputLayerBias: number[];
  hiddenLayerWeights: number[][];
  hiddenLayerBias: number[];
  outputLayerWeights: number[][];
  outputLayerBias: number[];
};

export type PredictResult = {
  hidden1Output: number[];
  hidden2Output: number[];
  finalOutput: number[];
};

function relu(x: number): number {
  'worklet';
  return Math.max(0, x);
}

function sigmoid(x: number): number {
  'worklet';
  return 1 / (1 + Math.exp(-x));
}

function softmax(arr: number[]): number[] {
  'worklet';
  const maxVal = Math.max(...arr);
  const expValues = arr.map(x => Math.exp(x - maxVal));
  const sumExp = expValues.reduce((a, b) => a + b, 0);
  return expValues.map(exp => exp / sumExp);
}

function matrixVectorMultiply(matrix: number[][], vector: number[]): number[] {
  'worklet';
  const result = new Array(matrix[0].length).fill(0);
  for (let i = 0; i < matrix[0].length; i++) {
    for (let j = 0; j < matrix.length; j++) {
      result[i] += matrix[j][i] * vector[j];
    }
  }
  return result;
}

export function predict(
  weights: NeuralNetworkWeights,
  input: number[][],
): PredictResult {
  'worklet';
  // Flatten input matrix into 1D array
  const flattenedInput = input.flat();

  // First hidden layer with 50 neurons and ReLU activation
  const hidden1 = matrixVectorMultiply(
    weights.inputLayerWeights,
    flattenedInput,
  );
  const hidden1Output = hidden1.map((val, i) =>
    sigmoid(val + weights.inputLayerBias[i]),
  );

  // Second hidden layer with 50 neurons and ReLU activation
  const hidden2 = matrixVectorMultiply(
    weights.hiddenLayerWeights,
    hidden1Output,
  );
  const hidden2Output = hidden2.map((val, i) =>
    relu(val + weights.hiddenLayerBias[i]),
  );

  // Output layer with 11 neurons (0-9 + None class) and softmax activation
  const output = matrixVectorMultiply(
    weights.outputLayerWeights,
    hidden2Output,
  );
  const preActivationOutput = output.map(
    (val, i) => val + weights.outputLayerBias[i],
  );

  // Apply softmax activation for classification
  const finalOutput = softmax(preActivationOutput);

  return {
    hidden1Output,
    hidden2Output,
    finalOutput,
  };
}

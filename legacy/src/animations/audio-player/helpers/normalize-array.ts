const normalizeArray = (arr: number[]): number[] => {
  const minValue = Math.min(...arr);
  const maxValue = Math.max(...arr);

  const normalizedWaveform = arr.map(value => {
    return (value - minValue) / (maxValue - minValue);
  });

  return normalizedWaveform;
};

export { normalizeArray };

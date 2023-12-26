const clamp = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(Math.max(value, min), max);
};

const findClosestSnapPoint = (value: number, snapPoints: number[]): number => {
  'worklet';
  return snapPoints.reduce(
    (prev, curr) =>
      Math.abs(curr - value) < Math.abs(prev - value) ? curr : prev,
    0,
  );
};

export { clamp, findClosestSnapPoint };

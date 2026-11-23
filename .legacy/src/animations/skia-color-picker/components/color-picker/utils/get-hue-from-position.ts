export const getHueFromPosition = (dx: number, dy: number) => {
  'worklet';
  const theta = Math.atan2(dy, dx);

  // Convert the angle theta to degrees and ensure it's in the range [0, 360)
  return (180 + (theta * 180) / Math.PI + 360) % 360; // Ensure hue is between 0 and 360
};

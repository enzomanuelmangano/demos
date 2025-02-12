export const logarithmicSpiral = ({
  angle,
  index,
}: {
  angle: number;
  index: number;
}) => {
  'worklet';
  const a = index / 4;
  const k = 0.005;
  return {
    x: a * Math.exp(k * angle) * Math.cos(angle * index),
    y: a * Math.exp(k * angle) * Math.sin(angle * index),
  };
};

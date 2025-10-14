import { createAnimatedPressable } from 'pressto';
import { interpolate } from 'react-native-reanimated';

const InputButton = createAnimatedPressable(progress => {
  'worklet';

  const opacity = interpolate(progress, [0, 1], [0, 0.1]);
  const scale = interpolate(progress, [0, 1], [1, 0.9]);

  return {
    backgroundColor: `rgba(255,255,255,${opacity})`,
    transform: [{ scale }],
    borderRadius: 20,
    borderCurve: 'continuous',
  };
});

export { InputButton };

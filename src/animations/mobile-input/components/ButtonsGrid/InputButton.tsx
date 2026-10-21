import { createAnimatedPressable } from 'pressto';
import { interpolate } from 'react-native-reanimated';

const InputButton = createAnimatedPressable(progress => {
  'worklet';

  // toFixed: as the press springs back, the raw value reaches ~1e-7, which
  // prints in scientific notation. Reanimated rejects that colour and throws
  // on the UI thread, which kills a release build.
  const opacity = interpolate(progress, [0, 1], [0, 0.1]).toFixed(3);
  const scale = interpolate(progress, [0, 1], [1, 0.9]);

  return {
    backgroundColor: `rgba(255,255,255,${opacity})`,
    transform: [{ scale }],
    borderRadius: 20,
  };
});

export { InputButton };

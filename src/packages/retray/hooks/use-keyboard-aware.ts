import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import { useDerivedValue, withSpring } from 'react-native-reanimated';

export const useKeyboardOffset = () => {
  const { height } = useReanimatedKeyboardAnimation();

  const keyboardAnimatedOffset = useDerivedValue(() => {
    return withSpring(height.value, {
      damping: 15,
      stiffness: 150,
      mass: 0.6,
    });
  });

  return {
    translateY: keyboardAnimatedOffset,
  };
};

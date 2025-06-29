import { LinearTransition } from 'react-native-reanimated';

export const LayoutTransition = LinearTransition.springify()
  .mass(1)
  .damping(20)
  .stiffness(120);

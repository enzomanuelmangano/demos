import { makeMutable } from 'react-native-reanimated';

// That's the trick. This is a global shared value that can be accessed from any component.
export const isSwitchingThemeShared = makeMutable(false);

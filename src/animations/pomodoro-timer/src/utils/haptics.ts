import { Platform } from 'react-native';

import * as Haptics from 'expo-haptics';

export const hapticLight = () => {
  if (Platform.OS === 'android') return; // haptics are weird on android :/
  Haptics.selectionAsync();
};

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export const hapticLight = () => {
  if (Platform.OS === 'android') return; // haptics are weird on android :/
  Haptics.selectionAsync();
};

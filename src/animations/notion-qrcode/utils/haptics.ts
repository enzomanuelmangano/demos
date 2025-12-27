import { Platform } from 'react-native';

import * as Haptics from 'expo-haptics';

export const hapticSoft = () => {
  if (Platform.OS === 'android') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

export const hapticLight = () => {
  if (Platform.OS === 'android') return;
  Haptics.selectionAsync();
};

export const hapticMedium = () => {
  if (Platform.OS === 'android') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};

export const hapticHeavy = () => {
  if (Platform.OS === 'android') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};

export const hapticSuccess = () => {
  if (Platform.OS === 'android') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

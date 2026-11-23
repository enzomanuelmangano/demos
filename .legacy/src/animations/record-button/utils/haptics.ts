import * as Haptics from 'expo-haptics';

export const hapticFeedback = (type = Haptics.ImpactFeedbackStyle.Light) => {
  Haptics.impactAsync(type);
};

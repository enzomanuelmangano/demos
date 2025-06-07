import * as Haptics from 'expo-haptics';

// I love Haptics :)
export const lightHapticFeedback = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};

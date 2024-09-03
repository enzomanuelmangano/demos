import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';

import { isSwitchingThemeShared, useTheme } from '../../theme';
import { PressableScale } from '../pressable-scale';

export const FloatingButtonTheme: React.FC = () => {
  const { bottom: safeBottom } = useSafeAreaInsets();

  const { colors, toggleTheme } = useTheme();

  return (
    <PressableScale
      onPressIn={() => {
        // Here we keep track that we are switching the theme
        // This is going to impact the Rescaler and the Theme Blur component
        isSwitchingThemeShared.value = true;
      }}
      onPress={toggleTheme}
      onPressOut={() => {
        // We have probably finished switching the theme or the animation has been cancelled.
        // We need to reset the shared value.
        isSwitchingThemeShared.value = false;
      }}
      style={[
        styles.button,
        {
          bottom: 32 + safeBottom,
          backgroundColor: colors.card,
          borderColor: colors.border,
        },
      ]}>
      <MaterialIcons name="sunny" size={20} color={colors.primary} />
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  button: {
    position: 'absolute',
    alignSelf: 'center',
    height: 64,
    right: 32,
    aspectRatio: 1,
    borderRadius: 32,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
    borderWidth: 1,
  },
});

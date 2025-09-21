import { View, StyleSheet } from 'react-native';

import { SwitchThemeButton } from '../../components/switch-theme';
import { useTheme } from '../../components/theme-provider';

const SearchScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ position: 'absolute', bottom: 20, right: 10 }}>
        <SwitchThemeButton
          contentContainerStyle={{
            backgroundColor: colors.card,
            height: 80,
            borderRadius: 50,
            width: 80,
          }}
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export { SearchScreen };

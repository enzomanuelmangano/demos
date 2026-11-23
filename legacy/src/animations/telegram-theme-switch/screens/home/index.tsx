import { View, StyleSheet } from 'react-native';

import { useTheme } from '../../components/theme-provider';

const HomeScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} />
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export { HomeScreen };

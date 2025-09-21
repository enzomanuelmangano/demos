import { View, StyleSheet } from 'react-native';

import { useTheme } from '../../components/theme-provider';

const HomeScreen = () => {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} />
  );
};

// Styles for the HomeScreen component
const styles = StyleSheet.create({
  container: {
    flex: 1, // Take up the entire available space
  },
});

// Export the HomeScreen component
export { HomeScreen };

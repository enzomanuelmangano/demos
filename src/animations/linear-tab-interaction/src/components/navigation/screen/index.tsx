import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Palette } from '../../../constants/palette';

type ScreenProps = {
  children?: React.ReactNode;
  title: string;
};

export function Screen({ children, title }: ScreenProps) {
  const { top: safeTop } = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.container,
        { paddingTop: safeTop, paddingHorizontal: 24 },
      ]}>
      <Text style={styles.subtitle}>Reactiive</Text>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Palette.background,
    flex: 1,
  },
  subtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.6)',
    marginBottom: 8,
    fontWeight: '600',
  },
  title: {
    fontSize: 24,
    color: 'white',
    marginBottom: 32,
    fontWeight: '600',
  },
});

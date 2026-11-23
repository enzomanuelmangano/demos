import { StyleSheet, View } from 'react-native';

import { type FC, type ReactNode } from 'react';

import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ModalContentProps {
  children: ReactNode;
}

export const ModalContent: FC<ModalContentProps> = ({ children }) => {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View style={[styles.container, { paddingTop: insets.top + 20 }]}>
      <View style={styles.pullIndicator} />
      <View style={styles.content}>{children}</View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderCurve: 'continuous',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
  },
  pullIndicator: {
    alignSelf: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    height: 4,
    marginBottom: 20,
    marginTop: 12,
    width: 40,
  },
});

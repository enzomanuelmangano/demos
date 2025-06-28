import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated from 'react-native-reanimated';

interface ModalContentProps {
  children: React.ReactNode;
}

export const ModalContent: React.FC<ModalContentProps> = ({ children }) => {
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
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderCurve: 'continuous',
  },
  content: {
    paddingHorizontal: 24,
  },
  pullIndicator: {
    width: 40,
    height: 4,
    backgroundColor: '#E5E7EB',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
});

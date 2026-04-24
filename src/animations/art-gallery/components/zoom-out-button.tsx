import { StyleSheet, View } from 'react-native';

import { FC } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { PressableScale } from 'pressto';

type ZoomOutButtonProps = {
  onPress: () => void;
};

export const ZoomOutButton: FC<ZoomOutButtonProps> = ({ onPress }) => {
  return (
    <PressableScale onPress={onPress}>
      <View style={styles.container}>
        <BlurView style={StyleSheet.absoluteFill} intensity={60} tint="dark" />
        <View style={styles.iconContainer}>
          <Ionicons name="contract-outline" size={24} color="#fff" />
        </View>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 28,
    borderWidth: StyleSheet.hairlineWidth,
    height: 56,
    overflow: 'hidden',
    width: 56,
  },
  iconContainer: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

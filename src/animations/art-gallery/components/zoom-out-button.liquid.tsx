import { StyleSheet, View } from 'react-native';

import { FC } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { GlassView } from 'expo-glass-effect';
import { PressableScale } from 'pressto';

type ZoomOutButtonProps = {
  onPress: () => void;
};

export const ZoomOutButton: FC<ZoomOutButtonProps> = ({ onPress }) => {
  return (
    <PressableScale onPress={onPress}>
      <View style={styles.container}>
        <GlassView
          style={StyleSheet.absoluteFill}
          glassEffectStyle="regular"
          tintColor="rgba(0, 0, 0, 0.3)"
          isInteractive
        />
        <View style={styles.iconContainer}>
          <Ionicons name="contract-outline" size={24} color="#fff" />
        </View>
      </View>
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 28,
    height: 56,
    overflow: 'hidden',
    width: 56,
  },
  iconContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

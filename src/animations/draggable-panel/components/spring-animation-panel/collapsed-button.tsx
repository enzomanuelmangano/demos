import React from 'react';
import { StyleSheet } from 'react-native';
import { PressableScale } from 'pressto';
import { Ionicons } from '@expo/vector-icons';

type CollapsedButtonProps = {
  onPress: () => void;
};

export const CollapsedButton: React.FC<CollapsedButtonProps> = ({
  onPress,
}) => {
  return (
    <PressableScale style={styles.button} onPress={onPress}>
      <Ionicons name="settings-sharp" size={24} color="#343a40" />
    </PressableScale>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 64,
    height: 64,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import { type FC } from 'react';
import { StyleSheet } from 'react-native';

type CollapsedButtonProps = {
  onPress: () => void;
};

export const CollapsedButton: FC<CollapsedButtonProps> = ({ onPress }) => {
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

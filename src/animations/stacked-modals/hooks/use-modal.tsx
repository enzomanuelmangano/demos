import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Octicons } from '@expo/vector-icons';
import type { Icon } from '@expo/vector-icons/build/createIconSet';
import { createAnimatedPressable } from 'pressto';
import { interpolateColor } from 'react-native-reanimated';

import { useStackedModal } from '../stacked-modal-manager/hooks';

type IconName<T, H extends string> = T extends Icon<infer U, H> ? U : never;
type OcticonsIconName = IconName<typeof Octicons, 'octicons'>;

export type ShowModalParams = {
  key: string;
  title: string;
  message?: string;
  iconName?: OcticonsIconName;
  trailing?: React.ReactNode;
  onConfirm?: () => void;
  onDismiss?: () => void;
};

const HighlightedConfirmButton = createAnimatedPressable(progress => {
  'worklet';
  return {
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['#50505000', '#bababa9b'],
    ),
    borderRadius: 8,
    borderCurve: 'continuous',
  };
});

const DismissButton = createAnimatedPressable(progress => {
  'worklet';
  return {
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['#d5534a00', '#e14f4482'],
    ),
    borderRadius: 8,
    borderCurve: 'continuous',
  };
});

export const useModal = () => {
  const { showStackedModal, clearAllStackedModals, clearModal } =
    useStackedModal();

  const showModal = useCallback(
    ({
      key,
      title,
      message,
      trailing,
      onConfirm,
      onDismiss,
    }: ShowModalParams) => {
      return showStackedModal({
        key,
        children: () => {
          return (
            <View style={{ flex: 1 }}>
              <View style={styles.container}>
                <View style={styles.header}>
                  <Text style={styles.title}>{title}</Text>
                </View>
                {message && <Text style={styles.message}>{message}</Text>}
                {trailing && (
                  <View style={styles.trailingContainer}>{trailing}</View>
                )}
              </View>
              <View style={styles.buttonContainer}>
                <DismissButton onPress={onDismiss} style={styles.button}>
                  <Text style={styles.buttonText}>Dismiss</Text>
                </DismissButton>
                <HighlightedConfirmButton
                  onPress={onConfirm}
                  style={styles.button}>
                  <Text style={styles.buttonText}>Confirm</Text>
                </HighlightedConfirmButton>
              </View>
            </View>
          );
        },
      });
    },
    [showStackedModal],
  );

  return {
    showModal,
    clearAllModals: clearAllStackedModals,
    clearModal,
  };
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  message: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  trailingContainer: {
    marginBottom: 12,
  },
  buttonContainer: {
    flexDirection: 'row',
    marginRight: 12,
    marginBottom: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 8,

    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#141414',
    fontWeight: 'bold',
  },
});

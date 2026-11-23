import { Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import * as Haptics from 'expo-haptics';

import type { SheetSettings } from './settings';

interface SettingsSheetProps {
  isOpen: boolean;
  settings: SheetSettings;
  onChange: (settings: Partial<SheetSettings>) => void;
  onClose: () => void;
}

/**
 * Non-iOS fallback for the settings sheet. The iOS build gets the real SwiftUI
 * one (settings-sheet.ios.tsx), with a native slider in place of these steps.
 */
export const SettingsSheet = ({
  isOpen,
  settings,
  onChange,
  onClose,
}: SettingsSheetProps) => {
  const toggle = (change: Partial<SheetSettings>) => {
    Haptics.selectionAsync();
    onChange(change);
  };

  return (
    <Modal
      transparent
      visible={isOpen}
      animationType="slide"
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <Text style={styles.title}>Light</Text>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Bulb</Text>
          <Switch
            value={settings.showBulb}
            onValueChange={showBulb => toggle({ showBulb })}
          />
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Cord</Text>
          <Switch
            value={settings.showCord && settings.showBulb}
            onValueChange={showCord => toggle({ showCord })}
          />
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Shader</Text>
          <Switch
            value={settings.relight}
            onValueChange={relight => toggle({ relight })}
          />
        </View>

        <View style={styles.rowBetween}>
          <Text style={styles.label}>Show depth</Text>
          <Switch
            value={settings.showDepth}
            onValueChange={showDepth => toggle({ showDepth })}
          />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    flex: 1,
  },
  label: {
    color: '#9b9b9b',
    fontSize: 13,
    marginBottom: 8,
    marginTop: 14,
  },
  rowBetween: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  sheet: {
    backgroundColor: '#151515',
    borderCurve: 'continuous',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingBottom: 42,
    paddingHorizontal: 22,
    paddingTop: 18,
  },
  title: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
});

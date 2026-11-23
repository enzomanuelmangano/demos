import {
  BottomSheet,
  Group,
  Host,
  Text,
  Toggle,
  VStack,
} from '@expo/ui/swift-ui';
import { font, padding, tint } from '@expo/ui/swift-ui/modifiers';
import * as Haptics from 'expo-haptics';

import { LAMP_TINT } from '../constants';

import type { SheetSettings } from './settings';

interface SettingsSheetProps {
  isOpen: boolean;
  settings: SheetSettings;
  onChange: (settings: Partial<SheetSettings>) => void;
  onClose: () => void;
}

const CONTENT_MODIFIERS = [padding({ all: 22 })];
const TITLE_MODIFIERS = [font({ textStyle: 'title3', weight: 'semibold' })];
// Tungsten rather than the stock system green, so the controls belong to the
// same room as the lamp they are switching.
const SWITCH_MODIFIERS = [tint(LAMP_TINT)];

/**
 * The bulb's own controls, in a real SwiftUI sheet.
 *
 * These are native toggles, so they never touch the app's global pressto
 * handler — the selection tick has to be fired by hand.
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
    <Host style={styles.host} colorScheme="dark">
      <BottomSheet
        isPresented={isOpen}
        onIsPresentedChange={presented => {
          if (!presented) {
            onClose();
          }
        }}
        fitToContents>
        <Group>
          <VStack spacing={20} modifiers={CONTENT_MODIFIERS}>
            <Text modifiers={TITLE_MODIFIERS}>Light</Text>
            <Toggle
              label="Bulb"
              isOn={settings.showBulb}
              modifiers={SWITCH_MODIFIERS}
              onIsOnChange={showBulb => toggle({ showBulb })}
            />
            <Toggle
              label="Cord"
              isOn={settings.showCord && settings.showBulb}
              modifiers={SWITCH_MODIFIERS}
              onIsOnChange={showCord => toggle({ showCord })}
            />
            <Toggle
              label="Shader"
              isOn={settings.relight}
              modifiers={SWITCH_MODIFIERS}
              onIsOnChange={relight => toggle({ relight })}
            />
            <Toggle
              label="Show depth"
              isOn={settings.showDepth}
              modifiers={SWITCH_MODIFIERS}
              onIsOnChange={showDepth => toggle({ showDepth })}
            />
          </VStack>
        </Group>
      </BottomSheet>
    </Host>
  );
};

const styles = { host: { position: 'absolute' } } as const;

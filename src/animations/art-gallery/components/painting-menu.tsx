import { Keyboard, StyleSheet } from 'react-native';

import { memo, useEffect } from 'react';

import { Host, Image, Menu, Toggle } from '@expo/ui/swift-ui';
import {
  accessibilityLabel,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
  menuIndicator,
  menuStyle,
} from '@expo/ui/swift-ui/modifiers';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ART_MOVEMENTS } from '../paintings';
import { useSelectedPaintingId } from '../state';

const LIQUID_GLASS = isLiquidGlassAvailable();

/** The demo's close button sits this far from the left edge; this mirrors it. */
const TRAILING = 16;
/**
 * The menu's label is framed by hand: `controlSize` does not reach a menu's
 * label, which drew a smaller glass circle than the close button's. Inside
 * the glass's own padding, this lands on the same diameter.
 */
const LABEL_SIZE = 15;

/**
 * The painting picker, drawn as the close button's twin: a SwiftUI menu whose
 * label is the same glass circle (bordered before iOS 26), so the two corners
 * of the gallery read as one set of system chrome.
 *
 * Subscribes only to the selected painting, so a pick re-renders the menu
 * and nothing else.
 */
export const PaintingMenu = memo(
  ({ onPaintingChange }: { onPaintingChange: (id: string | null) => void }) => {
    const { top } = useSafeAreaInsets();
    const selectedPaintingId = useSelectedPaintingId();

    // iOS 26's menu enables type-ahead filtering for large submenu trees: it
    // attaches a hidden UITextField and makes it first responder, summoning
    // the soft keyboard over the gallery, on open and again on each submenu.
    // SwiftUI's menu reports no open state, and the gallery has no field of
    // its own, so any keyboard that shows while it is mounted is the menu's.
    useEffect(() => {
      const sub = Keyboard.addListener('keyboardDidShow', () => {
        Keyboard.dismiss();
      });
      return () => sub.remove();
    }, []);

    return (
      <Host matchContents colorScheme="dark" style={[styles.host, { top }]}>
        <Menu
          label={
            <Image
              systemName="ellipsis"
              size={17}
              modifiers={[frame({ width: LABEL_SIZE, height: LABEL_SIZE })]}
            />
          }
          modifiers={[
            accessibilityLabel('Choose a painting'),
            menuStyle('button'),
            buttonStyle(LIQUID_GLASS ? 'glass' : 'bordered'),
            buttonBorderShape('circle'),
            controlSize('large'),
            menuIndicator('hidden'),
          ]}>
          <Toggle
            label="Default"
            isOn={selectedPaintingId === null}
            onIsOnChange={() => onPaintingChange(null)}
          />
          {ART_MOVEMENTS.map(movement => (
            <Menu key={movement.id} label={movement.name}>
              {movement.painters.map(painter => (
                <Menu key={painter.id} label={painter.name}>
                  {painter.paintings.map(painting => (
                    <Toggle
                      key={painting.id}
                      label={painting.name}
                      isOn={painting.id === selectedPaintingId}
                      onIsOnChange={() => onPaintingChange(painting.id)}
                    />
                  ))}
                </Menu>
              ))}
            </Menu>
          ))}
        </Menu>
      </Host>
    );
  },
);

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: TRAILING,
    zIndex: 1000,
  },
});

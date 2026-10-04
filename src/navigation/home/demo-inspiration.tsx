import { Linking, StyleSheet } from 'react-native';

import { useState } from 'react';

import {
  BottomSheet,
  Button,
  Group,
  Host,
  Text,
  VStack,
} from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  font,
  fixedSize,
  frame,
  labelStyle,
  offset,
  opacity,
  padding,
  presentationDragIndicator,
} from '@expo/ui/swift-ui/modifiers';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { Presets } from 'react-native-pulsar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { InspirationCopy } from './inspiration-copy';

const LIQUID_GLASS = isLiquidGlassAvailable();

/** The close button sits this far from the left edge; this mirrors it. */
const TRAILING = 16;

/** Native, so it eases like the system's own chrome rather than RN's. */
const APPEAR = Animation.easeOut({ duration: 0.22 });

/** Wider than any sheet: the action buttons span the sheet's full width. */
const FULL_WIDTH = 10000;

/** One inset on every side of the sheet's content, the bottom included. */
const INSET = 24;

const SHEET_MODIFIERS = [presentationDragIndicator('visible')];
const TITLE_MODIFIERS = [font({ textStyle: 'title2', weight: 'bold' })];
const STORY_MODIFIERS = [
  font({ textStyle: 'body' }),
  // Wraps to its full height rather than truncating while the sheet's
  // height is still being measured.
  fixedSize({ horizontal: false, vertical: true }),
];
const ACTION_LABEL_MODIFIERS = [
  font({ textStyle: 'headline' }),
  frame({ maxWidth: FULL_WIDTH }),
];

const open = (url: string) => {
  Linking.openURL(url).catch(() => undefined);
};

/**
 * Credit for a demo built after someone else's idea: an info button that
 * mirrors the close button at the top right, and the Inspiration sheet it
 * opens: when the demo was built, what it is inspired by, and a link to the
 * original.
 *
 * Same chrome as `DemoCloseButton`: a real SwiftUI button on liquid glass,
 * shown only while the demo is settled, faded by SwiftUI rather than RN.
 */
export const DemoInspiration = ({
  copy,
  visible,
}: {
  copy: InspirationCopy;
  visible: boolean;
}) => {
  const { top, bottom } = useSafeAreaInsets();
  const [presented, setPresented] = useState(false);
  // A sheet sized to its content still keeps the window's bottom safe area
  // under it, which left the button far higher off the bottom than the inset
  // at its sides. The content moves down into that area by what it exceeds
  // the inset; the top padding grows by as much, so the top keeps its gap.
  const shift = Math.max(0, bottom - INSET);

  return (
    <Host
      matchContents
      colorScheme="dark"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.host, { top }]}>
      <BottomSheet
        isPresented={presented}
        onIsPresentedChange={setPresented}
        fitToContents
        anchor={
          <Button
            label="Inspiration"
            systemImage="info"
            onPress={() => {
              Presets.System.impactLight();
              setPresented(true);
            }}
            modifiers={[
              labelStyle('iconOnly'),
              buttonStyle(LIQUID_GLASS ? 'glass' : 'bordered'),
              buttonBorderShape('circle'),
              controlSize('large'),
              opacity(visible ? 1 : 0),
              animation(APPEAR, visible),
            ]}
          />
        }>
        <Group modifiers={SHEET_MODIFIERS}>
          <VStack
            alignment="leading"
            spacing={16}
            modifiers={[
              padding({ horizontal: INSET, top: INSET + 4 + shift }),
              offset({ y: shift }),
            ]}>
            <Text modifiers={TITLE_MODIFIERS}>Inspiration</Text>
            <Text modifiers={STORY_MODIFIERS}>{copy.story}</Text>
            <Button
              onPress={() => open(copy.action.url)}
              modifiers={[
                buttonStyle(
                  LIQUID_GLASS ? 'glassProminent' : 'borderedProminent',
                ),
                // Concentric with the sheet: its corners measure about 50pt, less the
                // inset leaves more than half the button's height, so a capsule.
                buttonBorderShape('capsule'),
                controlSize('large'),
                // A little more air than between the lines of copy above.
                padding({ top: 8 }),
              ]}>
              <Text modifiers={ACTION_LABEL_MODIFIERS}>
                {copy.action.label}
              </Text>
            </Button>
          </VStack>
        </Group>
      </BottomSheet>
    </Host>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    right: TRAILING,
    zIndex: 1000,
  },
});

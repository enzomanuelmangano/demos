import { StyleSheet } from 'react-native';

import { Button, Host } from '@expo/ui/swift-ui';
import {
  Animation,
  animation,
  buttonBorderShape,
  buttonStyle,
  controlSize,
  labelStyle,
  opacity,
} from '@expo/ui/swift-ui/modifiers';
import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LIQUID_GLASS = isLiquidGlassAvailable();

/** Inset from the screen's left edge, as a navigation bar's leading item. */
const LEADING = 16;

/**
 * The height the demo's own chrome takes below the safe area: the close and
 * info buttons (a large glass circle, about 45pt) and a gap under them. A demo
 * with a header of its own starts it this far down, or the buttons cover it.
 */
export const DEMO_BUTTON_ROW_HEIGHT = 56;

/** Native, so it eases like the system's own chrome rather than RN's. */
const APPEAR = Animation.easeOut({ duration: 0.22 });

/**
 * The way out of every demo, drawn by the demo screen over whatever the demo
 * is: no demo renders it, and none has to leave room for it.
 *
 * A real SwiftUI button, so it is the system's own. On iOS 26 it is the
 * close role on liquid glass — the xmark the system draws for it; before,
 * the bordered circle with an xmark that sheets close with.
 *
 * Shown only while the demo is on screen and settled: it fades in with the
 * demo once the open has landed, and out as soon as a close is committed.
 * The fade is SwiftUI's, never an RN opacity on a parent: glass under an
 * animated opacity drops out of the hierarchy and pops back at 1.
 */
export const DemoCloseButton = ({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) => {
  const { top } = useSafeAreaInsets();
  return (
    <Host
      matchContents
      colorScheme="dark"
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.host, { top }]}>
      <Button
        // Outside a toolbar the close role draws its "Close" title too: the
        // label is spelled out and shown as its icon only.
        label="Close"
        systemImage="xmark"
        role={LIQUID_GLASS ? 'close' : 'default'}
        onPress={onPress}
        modifiers={[
          labelStyle('iconOnly'),
          buttonStyle(LIQUID_GLASS ? 'glass' : 'bordered'),
          buttonBorderShape('circle'),
          controlSize('large'),
          opacity(visible ? 1 : 0),
          animation(APPEAR, visible),
        ]}
      />
    </Host>
  );
};

const styles = StyleSheet.create({
  host: {
    left: LEADING,
    position: 'absolute',
    zIndex: 1000,
  },
});

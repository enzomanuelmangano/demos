import { memo } from 'react';

import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { launchTransition } from './launch-transition';

import type { LaunchMetadata } from './launch-transition';
import type { ReactNode } from 'react';
import type { SharedValue } from 'react-native-reanimated';

interface Props {
  groupId: string;
  size: number;
  radius: number;
  /** The press feedback, applied to the artwork (see below). */
  pressScale?: SharedValue<number>;
  children: ReactNode;
}

/**
 * An icon that opens its demo: the launch's shared element.
 *
 * The wrapper holds the icon's place and is what the library measures; the
 * artwork inside is what travels. It carries no animation of its own: in the
 * overlay the renderer moves and fades it, and while its demo is open it rests
 * in the demo's full-screen target, under the demo's opaque card. So an idle
 * icon costs no per-frame work while another one launches — with a page or
 * three of icons mounted, a style per icon ran dozens of worklets a frame.
 *
 * The press scale is the one exception, and it reads only its own value. It
 * scales the artwork, not the wrapper: the launch measures the wrapper on the
 * tap, and a wrapper caught mid-press measured smaller than the artwork it
 * lays out, so the flight started a few points off the icon. The artwork
 * carries its scale into the overlay and springs back as it flies.
 */
export const LaunchIcon = memo(
  ({ groupId, size, radius, pressScale, children }: Props) => {
    const metadata: LaunchMetadata = { radius };
    const box = { width: size, height: size };
    const pressStyle = useAnimatedStyle(() =>
      pressScale ? { transform: [{ scale: pressScale.get() }] } : {},
    );
    return (
      <launchTransition.Element
        name="app"
        groupId={groupId}
        metadata={metadata}
        style={box}>
        <Animated.View style={[box, pressStyle]}>{children}</Animated.View>
      </launchTransition.Element>
    );
  },
);

LaunchIcon.displayName = 'LaunchIcon';

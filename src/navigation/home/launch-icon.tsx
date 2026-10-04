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
  pressOpacity?: SharedValue<number>;
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
 * The press dim is the one exception, and it reads only its own value. It
 * dims the artwork, not the wrapper, and never changes its size: the launch
 * measures the icon on the tap, and a press that scaled it started the
 * flight off the icon's frame.
 */
export const LaunchIcon = memo(
  ({ groupId, size, radius, pressOpacity, children }: Props) => {
    const metadata: LaunchMetadata = { radius };
    const box = { width: size, height: size };
    const pressStyle = useAnimatedStyle(() =>
      pressOpacity ? { opacity: pressOpacity.get() } : {},
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

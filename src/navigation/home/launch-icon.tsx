import { View } from 'react-native';

import { memo } from 'react';

import { launchTransition } from './launch-transition';

import type { LaunchMetadata } from './launch-transition';
import type { ReactNode } from 'react';

interface Props {
  groupId: string;
  size: number;
  radius: number;
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
 */
export const LaunchIcon = memo(({ groupId, size, radius, children }: Props) => {
  const metadata: LaunchMetadata = { radius };
  const box = { width: size, height: size };
  return (
    <launchTransition.Element
      name="app"
      groupId={groupId}
      metadata={metadata}
      style={box}>
      <View style={box}>{children}</View>
    </launchTransition.Element>
  );
});

LaunchIcon.displayName = 'LaunchIcon';

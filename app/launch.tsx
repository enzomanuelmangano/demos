import { useRef, useState } from 'react';

import { useIsFocused } from 'expo-router';

import { DemoScreen } from '../src/navigation/home/demo-screen';
import { useLaunchTarget } from '../src/navigation/home/launch-store';

import type { LaunchTarget } from '../src/navigation/home/launch-store';

/**
 * The launcher's demo route, PRELOADED by the home screen before any tap.
 *
 * An open waits for its destination: the push to commit, the new screen to
 * mount, and its native views to lay out before they can be measured — the
 * better part of the delay between the tap and the first frame of motion. A
 * preloaded route is already mounted and laid out, so the tap only names the
 * demo (see launch-store.ts) and pushes.
 *
 * A route keeps the first demo it is given. A tap during a close names the
 * next demo while this one is still flying home, and that one opens in a
 * route of its own. The one exception is a launch that never got here.
 */
export default function LaunchScreen() {
  const target = useLaunchTarget();
  const [own, setOwn] = useState<LaunchTarget | null>(target);
  const focused = useIsFocused();
  const presented = useRef(false);
  if (focused) presented.current = true;
  if (own === null && target !== null) setOwn(target);
  // A launch given up before this route was ever presented (its push was
  // dropped; see the watchdog in app/index.tsx) leaves it preloaded and empty.
  if (own !== null && target === null && !presented.current) setOwn(null);
  return (
    <DemoScreen
      slug={own?.slug}
      source={own?.source ?? 'launcher'}
      token={own?.token ?? 0}
    />
  );
}

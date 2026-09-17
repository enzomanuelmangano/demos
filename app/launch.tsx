import { DemoScreen } from '../src/navigation/home/demo-screen';
import { useLaunchTarget } from '../src/navigation/home/launch-store';

/**
 * The launcher's demo route, PRELOADED by the home screen before any tap.
 *
 * An open waits for its destination: the push to commit, the new screen to
 * mount, and its native views to lay out before they can be measured — the
 * better part of the delay between the tap and the first frame of motion. A
 * preloaded route is already mounted and laid out, so the tap only names the
 * demo (see launch-store.ts) and pushes.
 */
export default function LaunchScreen() {
  const target = useLaunchTarget();
  return (
    <DemoScreen slug={target?.slug} source={target?.source ?? 'launcher'} />
  );
}

import { useCallback, useLayoutEffect, useRef } from 'react';

import { useFocusEffect, useRouter } from 'expo-router';
import { useAnimatedReaction } from 'react-native-reanimated';
import {
  ChoreographyScreen,
  useChoreographyProgress,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';

import { setLaunchTarget } from '../src/navigation/home/launch-store';
import {
  DEMO_SCREEN_ID,
  HOME_SCREEN_ID,
  launchGroup,
  launchGroupId,
  launchProgress,
  launchTransition,
  mountedLaunch,
  parseLaunchGroup,
} from '../src/navigation/home/launch-transition';
import { Springboard } from '../src/navigation/home/springboard';
import { useOnShakeEffect } from '../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../src/packages/retray';

import type { LaunchSource } from '../src/navigation/home/launch-transition';
import type { Trays } from '../src/trays';
import type { RefObject } from 'react';

/** How long an open may take to mount its demo before it is given up. */
const LAUNCH_WATCHDOG_MS = 1500;

type LaunchCommands = {
  open: (source: LaunchSource, slug: string) => void;
};

/**
 * The one subscriber to the choreography's session state on the home screen.
 *
 * The choreography hooks re-render their caller on every phase of a session,
 * several times per open and close. Called from the springboard they would
 * re-render the grid; here they re-render a component that draws nothing. The
 * clock reaches the grid through a shared value written on the UI thread, and
 * the open command reaches it through a ref read at call time.
 */
const LaunchBridge = ({
  commands,
}: {
  commands: RefObject<LaunchCommands | null>;
}) => {
  const router = useRouter();
  const { push } = useChoreographyRouter(router, HOME_SCREEN_ID);
  const { progress, groupId } = useChoreographyProgress();

  // Which icon is travelling, by the library's own session. Left as is between
  // sessions: an open demo keeps its icon hidden. The demo clears it when it
  // unmounts, which is after the close has landed.
  useLayoutEffect(() => {
    if (parseLaunchGroup(groupId)) launchGroup.set(groupId);
  }, [groupId]);
  useAnimatedReaction(
    () => progress.get(),
    value => {
      launchProgress.set(value);
    },
  );

  // Keep the launch route preloaded while the home is in front, so a tap opens
  // an already mounted screen (see app/launch.tsx). A launch consumes it; the
  // home regains focus when the close lands, and preloads the next one.
  useFocusEffect(
    useCallback(() => {
      router.prefetch('/launch');
    }, [router]),
  );

  // Assigned during render, deliberately: the springboard's handlers read the
  // ref at call time, and a press can only follow a render.
  commands.current = {
    open: (source, slug) => {
      // One launch at a time: a second tap while one is being prepared, open
      // or closing is ignored rather than naming a second icon.
      if (launchGroup.get() !== null) return;
      const group = launchGroupId(source, slug);
      // Named on the tap, before anything is measured: the home's gestures
      // gate on it from this frame.
      launchGroup.set(group);
      setLaunchTarget({ slug, source });
      push({
        href: '/launch',
        targetScreenId: DEMO_SCREEN_ID,
        transitionConfig: { group },
        ...launchTransition.navigationOptions,
      }).catch(() => undefined);
      // The library can refuse a push without rejecting — blocked by a session
      // still settling, it queues or drops it and resolves. A launch named for a
      // demo that never mounts would then gate every later tap and pull for
      // good, so it is released if its demo has not appeared in time.
      setTimeout(() => {
        if (launchGroup.get() === group && mountedLaunch.groupId !== group) {
          launchGroup.set(null);
        }
      }, LAUNCH_WATCHDOG_MS);
    },
  };
  return null;
};

// Home = the iOS SpringBoard launcher. Each icon opens its demo out of itself
// (src/navigation/home/launch-transition.tsx). Shake still opens the feedback
// tray.
export default function HomeScreen() {
  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help');
  }, [show]);

  useOnShakeEffect(handleFeedback);

  const commands = useRef<LaunchCommands | null>(null);
  const onOpen = useCallback((source: LaunchSource, slug: string) => {
    commands.current?.open(source, slug);
  }, []);

  return (
    // `keepVisible`: the library cross-fades the source screen with the
    // destination. The demo route is transparent and the springboard is what
    // it opens over, so the springboard stays.
    <ChoreographyScreen screenId={HOME_SCREEN_ID} keepVisible>
      <LaunchBridge commands={commands} />
      <Springboard onOpen={onOpen} />
    </ChoreographyScreen>
  );
}

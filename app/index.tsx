import { useCallback, useLayoutEffect, useRef } from 'react';

import { useFocusEffect, useRouter } from 'expo-router';
import { useAnimatedReaction } from 'react-native-reanimated';
import {
  ChoreographyScreen,
  useChoreographyProgress,
  useChoreographyRouter,
} from 'react-native-screen-choreography/expo-router';
import { scheduleOnRN } from 'react-native-worklets';

import {
  clearLaunchTarget,
  setLaunchTarget,
} from '../src/navigation/home/launch-store';
import {
  DEMO_SCREEN_ID,
  HOME_SCREEN_ID,
  launchClosing,
  launchFrame,
  launchGroup,
  launchGroupId,
  launchPose,
  launchProgress,
  launchSession,
  launchTransition,
  parseLaunchGroup,
  pendingLaunchTeardown,
} from '../src/navigation/home/launch-transition';
import { Springboard } from '../src/navigation/home/springboard';
import { useOnShakeEffect } from '../src/navigation/hooks/use-shake-gesture';
import { useRetray } from '../src/packages/retray';

import type { LaunchSource } from '../src/navigation/home/launch-transition';
import type { Trays } from '../src/trays';
import type { RefObject } from 'react';

/**
 * How long an open may take to mount its demo before it is given up. It covers
 * a tap queued behind a close, which waits for the close to land.
 */
const LAUNCH_WATCHDOG_MS = 2500;

/** Module-level: a worklet's callback into JS must outlive the component. */
const endClose = () => {
  launchSession.closing = false;
};

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
  // sessions: an open demo keeps its icon hidden. Cleared once the close has
  // landed: by the demo as it unmounts, or here when the library removed the
  // demo's route while the card was still flying (see `CLOSE_FADE`).
  useLayoutEffect(() => {
    if (parseLaunchGroup(groupId)) launchGroup.set(groupId);
  }, [groupId]);
  useAnimatedReaction(
    () => progress.get(),
    value => {
      launchProgress.set(value);
    },
  );
  useAnimatedReaction(
    () => launchClosing.get() && launchProgress.get() <= 0.001,
    (landed, wasLanded) => {
      if (!landed || wasLanded) return;
      // Always lowered on landing: a tap during the close can have named the
      // next launch, and its card must not open faded.
      launchClosing.set(false);
      const pending = pendingLaunchTeardown.get();
      if (pending === null) return;
      pendingLaunchTeardown.set(null);
      if (launchGroup.get() === pending) {
        launchGroup.set(null);
        launchFrame.set(null);
      }
      launchPose.translateX.set(0);
      launchPose.translateY.set(0);
      launchPose.scale.set(1);
      scheduleOnRN(endClose);
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
      const named = launchGroup.get();
      // One launch at a time: a second tap while one is being prepared or is
      // open is ignored rather than naming a second icon. A close is the
      // exception — the card is already on its way home, and a tap on another
      // icon (or the same one) is queued by the library until it lands.
      if (named !== null && !launchSession.closing) return;
      launchSession.closing = false;
      const token = ++launchSession.token;
      const group = launchGroupId(source, slug);
      // Named on the tap, before anything is measured, so the home's gestures
      // gate on it from this frame — unless a close is still flying, whose
      // card reads the group it is closing until the next session names this
      // one (see the layout effect above).
      if (named === null) launchGroup.set(group);
      setLaunchTarget({ slug, source, token });
      push({
        href: '/launch',
        targetScreenId: DEMO_SCREEN_ID,
        transitionConfig: { group },
        ...launchTransition.navigationOptions,
      }).catch(() => undefined);
      // The library can refuse a push without rejecting — blocked, it queues
      // or drops it and resolves. A launch named for a demo that is never
      // presented would then gate every later tap and pull for good, so it is
      // released if its route has not come to the front in time.
      setTimeout(() => {
        if (launchSession.token === token && launchSession.mounted !== token) {
          launchGroup.set(null);
          clearLaunchTarget(token);
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
    // A tap on an icon while a demo is still flying home is taken, and the
    // open waits for the close to land: the library lets an arriving screen
    // take touches by default (`allowInteractionDuringTransition`).
    <ChoreographyScreen screenId={HOME_SCREEN_ID} keepVisible>
      <LaunchBridge commands={commands} />
      <Springboard onOpen={onOpen} />
    </ChoreographyScreen>
  );
}

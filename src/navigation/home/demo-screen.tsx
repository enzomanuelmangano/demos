import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChoreographyScreen,
  useChoreographyRouter,
  useInteractiveTransition,
} from 'react-native-screen-choreography/expo-router';
import { scheduleOnRN } from 'react-native-worklets';

import { getIconBackdrop } from './icon-source';
import { clearLaunchTarget } from './launch-store';
import {
  CLOSE_SCALE,
  DEMO_SCREEN_ID,
  launchCardAt,
  launchFrame,
  launchGroup,
  launchGroupId,
  launchPose,
  launchProgress,
  homeTap,
  launchSession,
  launchTransition,
} from './launch-transition';
import { SCREEN_CORNER_RADIUS } from './screen-radius';
import {
  getAnimationComponent,
  getAnimationMetadata,
} from '../../animations/registry';
import { useRetray } from '../../packages/retray';
import { useOnShakeEffect } from '../hooks/use-shake-gesture';

import type { LaunchMetadata } from './launch-transition';
import type { Trays } from '../../trays';
import type { ReactNode } from 'react';

/**
 * The close drag. The card follows the finger down — part of the way, so it
 * reads as held rather than dragged off — and shrinks with the distance, to
 * `DRAG_MIN_SCALE` over `DRAG_SHRINK_TRAVEL` of the screen's height. Past
 * `CLOSE_SCALE` it closes on its own; let go before that, it springs back.
 */
const DRAG_SHRINK_TRAVEL = 0.5;
const DRAG_MIN_SCALE = 0.5;
const DRAG_FOLLOW_Y = 0.5;
const DRAG_FOLLOW_X = 0.35;
/**
 * Where the close drag always wins: the status bar and this much below it.
 * A strip there sits ABOVE the demo, so a touch that starts in it never
 * reaches the demo's own gestures — some claim the finger on touch-down
 * (`minDistance(0)`), and nothing can beat those to a drag. Anywhere else a
 * demo that handles the touch keeps it, and a demo that does not closes on a
 * clear drag down.
 */
const GRAB_ZONE = 20;
/** Sideways travel before the drag claims, after which it is the demo's. */
const FAIL_SIDEWAYS = 30;
/** Seconds of release velocity added to a drag to judge a throw. */
const THROW_PROJECTION = 0.12;
/** Back to full screen after a drag that did not close: quick, no bounce. */
const DRAG_HOME_SPRING = { damping: 26, stiffness: 300, mass: 1 };

/**
 * The flight home once the drag has crossed the threshold, in milliseconds, on
 * the library's ease-out timing. Not a spring: thrown so it would not hang at
 * the threshold, a clamped spring reached the icon still at speed and stopped
 * dead, the card jumping from a third of the screen to the icon in one frame.
 * An ease-out leaves quickly and lands slowly.
 */
const CLOSE_DURATION = 360;

/** The demo's content fades in over its card as the open lands. */
const CONTENT_FADE = { duration: 200, easing: Easing.out(Easing.quad) };
/** How far into the open the demo starts to mount. */
const MOUNT_AT_PROGRESS = 0.85;
/** A launch that never reports its landing still shows its demo. */
const MOUNT_BACKSTOP_MS = 1500;

/**
 * Everything a worklet on this screen calls back into JS is MODULE-LEVEL, on
 * purpose: worklets resolves such callbacks through a weak registry, and a
 * function owned by a component is collected once that component is gone — a
 * gesture event one frame after the route pops would then abort the process.
 * A module never goes away; the screen publishes its handlers into it.
 */
const scaleForDrag = (distance: number, screenHeight: number) => {
  'worklet';
  return interpolate(
    distance,
    [0, screenHeight * DRAG_SHRINK_TRAVEL],
    [1, DRAG_MIN_SCALE],
    'clamp',
  );
};

const closeHandlers: {
  begin: (() => void) | null;
  commit: (() => void) | null;
  abort: (() => void) | null;
} = { begin: null, commit: null, abort: null };
const beginClose = () => closeHandlers.begin?.();
const commitClose = () => closeHandlers.commit?.();
const abortClose = () => closeHandlers.abort?.();
const mountHandler: { current: (() => void) | null } = { current: null };
const mountDemo = () => mountHandler.current?.();

type CloseState = 'idle' | 'preparing' | 'ready' | 'unavailable';

/**
 * The close, prepared while the finger is still dragging.
 *
 * Starting a back session measures the icon it lands on and waits for it to
 * hold still — about a third of a second in a debug build. Started at the
 * threshold, that was a third of a second of a card frozen at 0.75 before it
 * flew. So the session is begun when the drag BEGINS, through the library's
 * interactive back, with its clock held at 1: nothing on screen changes (the
 * card is open, the icon in the overlay is transparent), and by the time the
 * card crosses the threshold the flight is ready to go. A drag that is let go
 * short of it cancels the session instead.
 *
 * Also the one subscriber to the choreography's session state on this screen:
 * the hooks re-render their caller on every phase, and here that renders
 * nothing. The handlers reach the gesture through the module.
 */
const CloseBridge = ({ onCommit }: { onCommit: () => void }) => {
  const router = useRouter();
  const choreography = useChoreographyRouter(router, DEMO_SCREEN_ID);
  const interactive = useInteractiveTransition();
  // Read at call time: the hooks return new objects on every render.
  const latest = useRef({ choreography, interactive });
  latest.current = { choreography, interactive };
  const state = useRef<CloseState>('idle');
  const pending = useRef<'commit' | 'abort' | null>(null);

  closeHandlers.begin = () => {
    if (state.current !== 'idle') return;
    state.current = 'preparing';
    pending.current = null;
    latest.current.interactive
      .beginBack()
      .catch(() => null)
      .then(session => {
        state.current = session ? 'ready' : 'unavailable';
        const next = pending.current;
        pending.current = null;
        if (next === 'commit') closeHandlers.commit?.();
        else if (next === 'abort') closeHandlers.abort?.();
      });
  };
  closeHandlers.commit = () => {
    if (state.current === 'preparing') {
      pending.current = 'commit';
      return;
    }
    launchSession.closing = true;
    onCommit();
    if (state.current === 'ready') {
      latest.current.interactive.finish({ duration: CLOSE_DURATION });
    } else {
      // No session to fly (it could not start, or the drag never began one):
      // the plain choreographed back, which also covers a deep link.
      latest.current.choreography
        .back({ duration: CLOSE_DURATION })
        .catch(() => undefined);
    }
    state.current = 'idle';
  };
  closeHandlers.abort = () => {
    if (state.current === 'preparing') {
      pending.current = 'abort';
      return;
    }
    if (state.current === 'ready') latest.current.interactive.cancel();
    state.current = 'idle';
  };

  useEffect(
    () => () => {
      closeHandlers.begin = null;
      closeHandlers.commit = null;
      closeHandlers.abort = null;
    },
    [],
  );
  return null;
};

/**
 * A demo, opened out of the icon that was tapped.
 *
 * Not a pushed screen: a transparent route over the SpringBoard. The icon's
 * artwork travels in the choreography overlay (see launch-transition.tsx) and
 * lands in this screen's full-screen target; the card it opens into is drawn
 * HERE, under the overlay, on the same clock — the demo's backdrop colour, and
 * once mounted the demo itself, scaled into it. On the way back the same card
 * shrinks, with the running demo inside, into the icon.
 */
const DemoLaunch = ({
  slug,
  groupId,
  token,
}: {
  slug: string;
  groupId: string | null;
  token: number;
}) => {
  const dimensions = useWindowDimensions();
  const { width, height } = dimensions;
  const backdrop = getIconBackdrop(slug);
  const AnimationComponent = getAnimationComponent(slug);

  // The launch is this screen's while it is here, and it tears it down when it
  // unmounts, after the close has landed on the icon — unless a tap during the
  // close has already named the next launch, which is left alone.
  useLayoutEffect(() => {
    launchSession.mounted = token;
    // A pose frozen by the previous close must not move this card.
    launchPose.translateX.set(0);
    launchPose.translateY.set(0);
    launchPose.scale.set(1);
    return () => {
      if (launchSession.mounted === token) launchSession.mounted = 0;
      clearLaunchTarget(token);
      if (launchSession.token !== token) return;
      launchSession.closing = false;
      if (groupId !== null && launchGroup.get() === groupId) {
        launchGroup.set(null);
        launchFrame.set(null);
      }
      launchPose.translateX.set(0);
      launchPose.translateY.set(0);
      launchPose.scale.set(1);
    };
  }, [groupId, token]);

  // The card: its SIZE by layout, its place by a transform. Scaling a full-
  // screen view to the card instead was cheaper, but not uniformly — the icon
  // is square and the screen is not — and a corner radius under an uneven
  // scale is an ellipse, which showed as the card squared up on the icon.
  // Only the card lays out: the demo inside has a fixed size, is scaled
  // uniformly to the card's width, and is cropped top and bottom by it.
  const cardStyle = useAnimatedStyle(() => {
    const mine = groupId !== null && launchGroup.get() === groupId;
    const frame = launchFrame.get();
    const measured = mine && frame?.groupId === groupId;
    const card = launchCardAt(
      measured ? frame : { groupId: '', x: 0, y: 0, width, height, radius: 0 },
      width,
      height,
      mine ? launchProgress.get() : 1,
      launchPose.translateX.get(),
      launchPose.translateY.get(),
      launchPose.scale.get(),
    );
    return {
      // Named but not yet measured: nothing to draw until the icon is known.
      opacity: mine && !measured ? 0 : 1,
      width: card.width,
      height: card.height,
      borderRadius: card.radius,
      transform: [
        { translateX: card.centerX - card.width / 2 },
        { translateY: card.centerY - card.height / 2 },
      ],
    };
  });
  const contentStyle = useAnimatedStyle(() => {
    const mine = groupId !== null && launchGroup.get() === groupId;
    const frame = launchFrame.get();
    const card = launchCardAt(
      mine && frame?.groupId === groupId
        ? frame
        : { groupId: '', x: 0, y: 0, width, height, radius: 0 },
      width,
      height,
      mine ? launchProgress.get() : 1,
      launchPose.translateX.get(),
      launchPose.translateY.get(),
      launchPose.scale.get(),
    );
    return {
      transform: [
        { translateX: (card.width - width) / 2 },
        { translateY: (card.height - height) / 2 },
        { scale: card.width / width },
      ],
    };
  });

  // The demo mounts near the end of the open. Its first render can be heavy
  // (hundreds of views), and the launch waits for this screen to lay out: with
  // only the card to lay out it starts at once, the card covers the screen for
  // most of the flight, and the mount's work lands in the settle, as the
  // content fades in over the flat backdrop.
  const [mounted, setMounted] = useState(groupId === null);
  mountHandler.current = () => setMounted(true);
  useAnimatedReaction(
    () =>
      groupId !== null &&
      launchGroup.get() === groupId &&
      launchProgress.get() >= MOUNT_AT_PROGRESS,
    (ready, wasReady) => {
      if (ready && !wasReady) scheduleOnRN(mountDemo);
    },
  );
  useEffect(() => {
    if (mounted) return undefined;
    const t = setTimeout(() => setMounted(true), MOUNT_BACKSTOP_MS);
    return () => clearTimeout(t);
  }, [mounted]);
  const contentOpacity = useSharedValue(groupId === null ? 1 : 0);
  useEffect(() => {
    if (mounted) contentOpacity.set(withTiming(1, CONTENT_FADE));
  }, [mounted, contentOpacity]);
  const fadeStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.get(),
  }));

  return (
    <View style={styles.fill}>
      {groupId !== null ? (
        <launchTransition.Element.Target
          name="app"
          groupId={groupId}
          metadata={{ radius: SCREEN_CORNER_RADIUS } satisfies LaunchMetadata}
          style={styles.target}
          // The artwork rests here while the demo is open. The card covers the
          // screen but not its rounded corners, where the icon showed through.
          // It takes no touch: a full-screen host is hit-tested like any view,
          // opacity or not, and it swallowed taps on the home during a close.
          hostStyle={styles.hiddenHost}
        />
      ) : null}
      <Animated.View
        style={[styles.card, { backgroundColor: backdrop }, cardStyle]}>
        <Animated.View
          style={[styles.content, { width, height }, contentStyle]}>
          {mounted && AnimationComponent ? (
            <Animated.View style={[styles.fill, fadeStyle]}>
              <AnimationComponent {...(dimensions as any)} />
            </Animated.View>
          ) : null}
        </Animated.View>
      </Animated.View>
    </View>
  );
};

/**
 * The close gesture: a drag down, anywhere. The card shrinks with it; past
 * `CLOSE_SCALE` the pose freezes and the close flies home from it — or at a
 * release whose throw would carry it past. It lives OUTSIDE the choreography
 * screen: once the close's session starts the library blocks that screen's
 * touches, and a recognizer inside it was cancelled — springing the frozen
 * pose back mid-flight.
 */
const CloseGesture = ({
  enabled,
  released = false,
  children,
}: {
  enabled: boolean;
  released?: boolean;
  children: ReactNode;
}) => {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const grabZone = insets.top + GRAB_ZONE;
  // Whether this drag owns the pose: false until it starts on a settled demo,
  // and false again once it has handed the card to the close, so neither the
  // finger nor the release can move the card after that.
  const dragging = useSharedValue(false);
  const closeGesture = Gesture.Pan()
    .enabled(enabled)
    // Down only; sideways travel first belongs to the demo. A drag that
    // starts in the grab strip (see `GRAB_ZONE`) never reaches the demo, so
    // there it always closes; elsewhere a demo that uses the touch keeps it.
    .activeOffsetY(10)
    .failOffsetX([-FAIL_SIDEWAYS, FAIL_SIDEWAYS])
    .onStart(() => {
      // Not while a launch is flying: the close would be refused, and the pose
      // would stay frozen on an open card.
      const group = launchGroup.get();
      const settled = group === null || launchProgress.get() >= 0.999;
      dragging.set(settled);
      if (settled) scheduleOnRN(beginClose);
    })
    .onUpdate(event => {
      if (!dragging.get()) return;
      const distance = Math.max(0, event.translationY);
      const scale = scaleForDrag(distance, height);
      launchPose.translateX.set(event.translationX * DRAG_FOLLOW_X);
      launchPose.translateY.set(distance * DRAG_FOLLOW_Y);
      launchPose.scale.set(scale);
      if (scale <= CLOSE_SCALE) {
        dragging.set(false);
        scheduleOnRN(commitClose);
      }
    })
    .onEnd(event => {
      if (!dragging.get()) return;
      const thrown =
        Math.max(0, event.translationY) +
        Math.max(0, event.velocityY) * THROW_PROJECTION;
      if (scaleForDrag(thrown, height) <= CLOSE_SCALE) {
        dragging.set(false);
        scheduleOnRN(commitClose);
      }
    })
    .onFinalize(() => {
      if (!dragging.get()) return;
      dragging.set(false);
      scheduleOnRN(abortClose);
      launchPose.translateX.set(withSpring(0, DRAG_HOME_SPRING));
      launchPose.translateY.set(withSpring(0, DRAG_HOME_SPRING));
      launchPose.scale.set(withSpring(1, DRAG_HOME_SPRING));
    });

  return (
    <GestureDetector gesture={closeGesture}>
      <View
        // Released (a close is flying home), the demo keeps the touch only to
        // hand a tap on to the home under it; see `homeTap`.
        onTouchEnd={
          released
            ? event =>
                homeTap.current?.(
                  event.nativeEvent.pageX,
                  event.nativeEvent.pageY,
                )
            : undefined
        }
        pointerEvents={enabled ? 'auto' : released ? 'box-only' : 'none'}
        style={styles.fill}>
        {children}
        {/* Not collapsable: a view with only layout props is flattened away by
            Fabric, and the touch then lands on the demo under it. */}
        <View
          collapsable={false}
          style={[styles.grabZone, { height: grabZone }]}
        />
      </View>
    </GestureDetector>
  );
};

/**
 * A demo host: the launch choreography around one demo (see DemoLaunch). The
 * routes only resolve which demo — app/launch.tsx for the launcher,
 * app/animations/[slug].tsx for a deep link. Shake opens the feedback tray.
 */
export const DemoScreen = ({
  slug,
  source,
  token = 0,
}: {
  slug: string | undefined;
  source?: string;
  token?: number;
}) => {
  // Once the close is committed the demo takes no more touches, so a tap on
  // the home while the card flies back reaches the icon under it.
  const [released, setReleased] = useState(false);
  const release = useCallback(() => setReleased(true), []);
  const { show } = useRetray<Trays>();
  const handleFeedback = useCallback(() => {
    show('help', { slug });
  }, [show, slug]);

  useOnShakeEffect(handleFeedback);

  // The preloaded launch route before a tap: the same tree, empty, so naming a
  // demo only adds the card and the target to a screen already laid out. The
  // tree must stay the SAME one — a close gesture mounted in the commit that
  // starts the launch never recognized. What changes is that an idle route
  // takes no touch at all: preloaded, it can still be hit over the home, and
  // it swallowed the taps meant for the icons under it.
  if (slug === undefined && source === 'launcher') {
    return (
      <CloseGesture enabled={false}>
        <ChoreographyScreen screenId={DEMO_SCREEN_ID} keepVisible>
          <View style={styles.fill} />
        </ChoreographyScreen>
      </CloseGesture>
    );
  }

  if (!slug || !getAnimationComponent(slug) || !getAnimationMetadata(slug)) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          {slug ? `Animation "${slug}" not found` : 'No animation specified'}
        </Text>
      </View>
    );
  }

  // Opened from the launcher: pair with the icon it came from. Opened any
  // other way (a deep link) there is no icon, and it simply appears.
  const groupId =
    source === 'grid' || source === 'search'
      ? launchGroupId(source, slug)
      : null;

  return (
    <CloseGesture enabled={!released} released={released}>
      <ChoreographyScreen screenId={DEMO_SCREEN_ID} keepVisible>
        <CloseBridge onCommit={release} />
        <DemoLaunch slug={slug} groupId={groupId} token={token} />
      </ChoreographyScreen>
    </CloseGesture>
  );
};

const styles = StyleSheet.create({
  card: {
    borderCurve: 'continuous',
    left: 0,
    overflow: 'hidden',
    position: 'absolute',
    top: 0,
  },
  content: {
    left: 0,
    position: 'absolute',
    top: 0,
  },
  errorContainer: {
    alignItems: 'center',
    backgroundColor: 'black',
    flex: 1,
    justifyContent: 'center',
  },
  errorText: {
    color: 'white',
    fontSize: 16,
    textAlign: 'center',
  },
  fill: { flex: 1 },
  grabZone: { left: 0, position: 'absolute', right: 0, top: 0 },
  hiddenHost: { opacity: 0, pointerEvents: 'none' },
  target: { ...StyleSheet.absoluteFill, pointerEvents: 'none' },
});

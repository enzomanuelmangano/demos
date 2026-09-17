import { StyleSheet } from 'react-native';

import { useLayoutEffect } from 'react';

import Animated, {
  makeMutable,
  useAnimatedStyle,
} from 'react-native-reanimated';
import {
  defineTransition,
  makeTransition,
  type TransitionRendererProps,
} from 'react-native-screen-choreography/core';

import { SCREEN_CORNER_RADIUS } from './screen-radius';

// The app launch, as a choreography: the tapped icon is the shared element.
// Its content (the icon artwork) is ONE native subtree that the library lifts
// into its overlay, flies to the demo screen's full-screen target and back.
// The demo screen supplies the card underneath — see `DemoLaunch` in
// app/animations/[slug].tsx — which follows the same frame on the same clock.

/** `ChoreographyScreen` ids: the springboard, and the demo it opens. */
export const HOME_SCREEN_ID = 'Home';
export const DEMO_SCREEN_ID = 'Demo';

/** Where a demo was opened from. Each is its own group, see `launchGroupId`. */
export type LaunchSource = 'grid' | 'search';

// One group per demo AND per source: the grid icon and the search row of the
// same demo are both mounted on the home screen, and two elements with the
// same id in the same group would be ambiguous for the pairing.
const GROUP_PREFIX = 'launch.';
export const launchGroupId = (source: LaunchSource, slug: string) =>
  `${GROUP_PREFIX}${source}.${slug}`;

/** The source and slug behind a session's group id, or null for another group. */
export const parseLaunchGroup = (groupId: string | null | undefined) => {
  if (!groupId?.startsWith(GROUP_PREFIX)) return null;
  const rest = groupId.slice(GROUP_PREFIX.length);
  const dot = rest.indexOf('.');
  if (dot < 0) return null;
  return {
    source: rest.slice(0, dot) as LaunchSource,
    slug: rest.slice(dot + 1),
  };
};

/** The rect a launch collapses into: the icon, in window coordinates. */
export interface LaunchFrame {
  groupId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

/**
 * The group of the launch in play, or null.
 *
 * Module-level shared values rather than context, as in tempo's mistakes
 * preview: the icons and the demo decide on the UI thread whether they are the
 * one travelling, and no component re-renders with the session's phases.
 *
 * Named on the tap (app/index.tsx), so the home's gestures gate on it from
 * that frame, and confirmed from the library's session. A second tap while one
 * is named is ignored, so two quick taps can never name one icon while another
 * flies. Cleared by the demo when it unmounts, after the close has landed.
 */
export const launchGroup = makeMutable<string | null>(null);

/**
 * Plain-JS bookkeeping for the launches, read and written on the JS thread.
 *
 * - `token` names the latest launch. A demo only tears the launch down when
 *   it unmounts if it is still the latest one: a tap during a close already
 *   named the next launch, which the closing demo must not clear.
 * - `closing` is up once a close has been committed, and lets a tap on the
 *   home name the next launch while the card is still flying home.
 * - `mounted` is the token of the demo screen currently mounted, for the open
 *   command's watchdog (see app/index.tsx).
 */
export const launchSession = { token: 0, closing: false, mounted: 0 };

/**
 * A tap that lands on a closing demo, handed to the home. While the card flies
 * home the demo route is still presented above the springboard, and a touch
 * cannot reach the icons under it; the demo forwards the point instead, and
 * the springboard opens whatever icon is there. Published by the springboard.
 */
export const homeTap: { current: ((x: number, y: number) => void) | null } = {
  current: null,
};

/**
 * The choreography's expansion clock, mirrored: 0 at the icon, 1 full screen,
 * in both directions. Written on the UI thread by the home screen's bridge.
 */
export const launchProgress = makeMutable(0);

/**
 * The collapsed end of the launch in play. Captured by the renderer from the
 * library's own measurement when the flight begins, and read by the demo's
 * card so that both draw the same frame on the same frame.
 */
export const launchFrame = makeMutable<LaunchFrame | null>(null);

/** Linear interpolation from the icon to the full screen, by `progress`. */
export const frameAt = (
  frame: LaunchFrame,
  screenWidth: number,
  screenHeight: number,
  progress: number,
) => {
  'worklet';
  const t = Math.max(0, Math.min(1, progress));
  return {
    x: frame.x * (1 - t),
    y: frame.y * (1 - t),
    width: frame.width + (screenWidth - frame.width) * t,
    height: frame.height + (screenHeight - frame.height) * t,
    radius: frame.radius + (SCREEN_CORNER_RADIUS - frame.radius) * t,
  };
};

/**
 * The close drag: the card follows the finger down and shrinks with it. Written
 * on the UI thread by the demo's pan; FROZEN when the card crosses
 * `CLOSE_SCALE`, which is what starts the close, so the flight home starts from
 * the pose the card was in. Read by the demo's card and by the renderer, which
 * both unwind it over the flight (see `launchCardAt`), and by the home's blur.
 * Reset by the demo when it unmounts, after the flight has landed.
 */
export const launchPose = {
  translateX: makeMutable(0),
  translateY: makeMutable(0),
  scale: makeMutable(1),
};

/** Dragged smaller than this, the demo closes on its own. */
export const CLOSE_SCALE = 0.75;

/**
 * Where the card is on screen, by the launch clock and the drag pose: its
 * centre and its size as a scale of the full screen on each axis.
 *
 * Everything that moves in a launch is derived from this ONE function — the
 * demo's card, the demo inside it, the icon in the overlay — and moved by
 * TRANSFORMS only. The first version animated the card's left/top/width/height
 * like the library's own surface does: every frame of every launch then ran a
 * Yoga layout and a shadow-tree commit on the UI thread, with the whole demo
 * mounted under the card. A transform is a property of the layer.
 *
 * The pose is whole while the card is open (expansion 1) and unwound as it
 * flies home, gone at the icon (expansion 0).
 */
export const launchCardAt = (
  frame: LaunchFrame,
  screenWidth: number,
  screenHeight: number,
  expansion: number,
  poseX: number,
  poseY: number,
  poseScale: number,
) => {
  'worklet';
  const rect = frameAt(frame, screenWidth, screenHeight, expansion);
  const pose = 1 + (poseScale - 1) * Math.max(0, Math.min(1, expansion));
  const held = Math.max(0, Math.min(1, expansion));
  return {
    centerX: rect.x + rect.width / 2 + poseX * held,
    centerY: rect.y + rect.height / 2 + poseY * held,
    width: rect.width * pose,
    height: rect.height * pose,
    radius: rect.radius * pose,
  };
};

/** The icon artwork fades as the card grows, and returns as it lands. */
export const iconOpacityAt = (progress: number) => {
  'worklet';
  return 1 - Math.max(0, Math.min(1, progress / 0.3));
};

/** Metadata each endpoint registers: the icon's corner radius. */
export interface LaunchMetadata {
  radius: number;
}

const radiusOf = (metadata: unknown) =>
  (metadata as LaunchMetadata | undefined)?.radius ?? 0;

/**
 * The icon artwork, flying. Not the library's surface: that one tweens a frame
 * by layout props, and the colour of the opening app is the demo's own card,
 * drawn under the overlay on the same clock. Here the icon keeps its own size
 * in layout and is carried to the card by a transform — centred on it, scaled
 * to its width — fading over the first part of the growth.
 */
const LaunchRenderer = ({
  source,
  target,
  progress,
  direction,
  groupId,
  zIndex,
  children,
}: TransitionRendererProps) => {
  const backward = direction === 'backward';
  const collapsed = backward ? target : source;
  const expanded = backward ? source : target;
  const collapsedRadius = radiusOf(collapsed.metadata);
  const { pageX, pageY, width, height } = collapsed.metrics;
  const screenWidth = expanded.metrics.width;
  const screenHeight = expanded.metrics.height;
  // Published as the overlay commits, before its first frame. Until then the
  // demo's card holds still: it checks the frame's group, and the demo clears
  // the frame when it unmounts, so no launch ever reads the previous icon.
  useLayoutEffect(() => {
    launchFrame.set({
      groupId,
      x: pageX,
      y: pageY,
      width,
      height,
      radius: collapsedRadius,
    });
  }, [groupId, pageX, pageY, width, height, collapsedRadius]);

  const iconStyle = useAnimatedStyle(() => {
    const expansion = progress.get();
    const card = launchCardAt(
      { groupId, x: pageX, y: pageY, width, height, radius: collapsedRadius },
      screenWidth,
      screenHeight,
      expansion,
      launchPose.translateX.get(),
      launchPose.translateY.get(),
      launchPose.scale.get(),
    );
    return {
      opacity: iconOpacityAt(expansion),
      transform: [
        { translateX: card.centerX - (pageX + width / 2) },
        { translateY: card.centerY - (pageY + height / 2) },
        { scale: card.width / width },
      ],
    };
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.icon,
        { left: pageX, top: pageY, width, height, zIndex },
        iconStyle,
      ]}>
      {children}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  icon: { position: 'absolute' },
});

/**
 * One shared role, the app: the icon on the home screen, the full screen on
 * the demo. The timing is the launcher's: quick escape from the icon, long
 * settle.
 */
export const launchTransition = defineTransition({
  motion: {
    spring: {
      damping: 36,
      mass: 1,
      stiffness: 380,
      overshootClamping: true,
      restDisplacementThreshold: 0.001,
      restSpeedThreshold: 0.001,
    },
  },
  shared: {
    app: makeTransition({ renderer: LaunchRenderer }),
  },
});

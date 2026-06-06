import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';

import React, { memo, useEffect } from 'react';

import { LinearGradient } from 'expo-linear-gradient';
import { useAtomValue, useSetAtom } from 'jotai';
import { PressableScale } from 'pressto';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import {
  interactedAtom,
  isPlySelectedFamily,
  movesAtom,
  plyFrameFamily,
  selectedPlyAtom,
  selectMoveAtom,
} from './state';
import { theme, withAlpha } from './theme';

const HAIRLINE = StyleSheet.hairlineWidth;
const SPRING = { duration: 200, easing: Easing.out(Easing.cubic) };
const FADE = { duration: 180, easing: Easing.out(Easing.cubic) };
const SAN_DIM = withAlpha(theme.text, 0.4);

// Edge-fade colours — the card's own surface dissolving to transparent, so
// tokens slide under the rounded corners instead of clipping hard.
const FADE_SOLID = theme.surfaceHi;
const FADE_CLEAR = withAlpha(theme.surfaceHi, 0);

const MoveCell = memo<{ ply: number; san: string }>(({ ply, san }) => {
  const selected = useAtomValue(isPlySelectedFamily(ply));
  const select = useSetAtom(selectMoveAtom);
  const setFrame = useSetAtom(plyFrameFamily(ply));
  const isWhite = ply % 2 === 0;

  // Gentle mount: each token fades/rises in as its move lands, instead of
  // popping into the row.
  const mount = useSharedValue(0);
  useEffect(() => {
    mount.value = withTiming(1, FADE);
  }, [mount]);
  const mountStyle = useAnimatedStyle(() => ({
    opacity: mount.value,
    transform: [{ translateY: (1 - mount.value) * 3 }],
  }));

  // Plain colour fade dim↔bright (rgb constant, alpha ramps — no flicker).
  const sel = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    sel.value = withTiming(selected ? 1 : 0, FADE);
  }, [selected, sel]);
  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(sel.value, [0, 1], [SAN_DIM, theme.text]),
  }));

  return (
    <>
      {isWhite ? (
        <Animated.Text style={[styles.no, mountStyle]}>
          {ply / 2 + 1}.
        </Animated.Text>
      ) : null}
      <Animated.View
        style={mountStyle}
        onLayout={(e: LayoutChangeEvent) => setFrame(e.nativeEvent.layout)}>
        <PressableScale onPress={() => select(ply)} style={styles.sanHit}>
          <Animated.Text style={[styles.san, textStyle]}>{san}</Animated.Text>
        </PressableScale>
      </Animated.View>
    </>
  );
});
MoveCell.displayName = 'MoveCell';

// The sliding highlight. Subscribes to the selection + the selected ply's
// frame only — re-renders on selection, never re-maps the token list.
const HighlightPill: React.FC = () => {
  const selectedPly = useAtomValue(selectedPlyAtom);
  const frame = useAtomValue(plyFrameFamily(selectedPly));
  // Hidden during the auto-replay; appears (fades in) only once the user taps.
  const interacted = useAtomValue(interactedAtom);

  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const w = useSharedValue(0);
  const h = useSharedValue(0);
  const shown = useSharedValue(0);
  const ready = useSharedValue(false);

  useEffect(() => {
    if (!interacted || selectedPly < 0 || !frame) {
      shown.value = withTiming(0, { duration: 120 });
      ready.value = false;
      return;
    }
    // Snap into place on first appearance (fade the opacity in), then slide
    // between subsequent selections.
    const animate = ready.value;
    x.value = animate ? withTiming(frame.x, SPRING) : frame.x;
    y.value = animate ? withTiming(frame.y, SPRING) : frame.y;
    w.value = animate ? withTiming(frame.width, SPRING) : frame.width;
    h.value = animate ? withTiming(frame.height, SPRING) : frame.height;
    shown.value = withTiming(1, { duration: 220 });
    ready.value = true;
  }, [interacted, selectedPly, frame, x, y, w, h, shown, ready]);

  const style = useAnimatedStyle(() => ({
    opacity: shown.value,
    width: w.value,
    height: h.value,
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));

  return <Animated.View style={[styles.pill, style]} pointerEvents="none" />;
};

// Reads only the move list — re-renders solely when moves are added/reset,
// never on selection. Everything visual (edge fades, empty↔list cross-fade,
// token mounts) runs on shared values — no component state.
export const MoveHistory: React.FC = () => {
  const moves = useAtomValue(movesAtom);
  const hasMoves = moves.length > 0;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();

  // Scroll geometry, written on the UI thread — drives the edge fades without
  // ever re-rendering the list.
  const offsetX = useSharedValue(0);
  const contentW = useSharedValue(0);
  const viewW = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(e => {
    offsetX.value = e.contentOffset.x;
    contentW.value = e.contentSize.width;
    viewW.value = e.layoutMeasurement.width;
  });

  // Cross-fade between the empty caption and the move row — no branch swap.
  // The caption leaves instantly but only ENTERS after a quiet delay: during a
  // reset/replay the first move lands well inside the delay, so "No moves yet"
  // never flashes — it only appears when the board is genuinely idle.
  const shown = useSharedValue(hasMoves ? 1 : 0);
  const emptyShown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(hasMoves ? 1 : 0, FADE);
    emptyShown.value = hasMoves
      ? withTiming(0, FADE)
      : withDelay(600, withTiming(1, FADE));
  }, [hasMoves, shown, emptyShown]);

  const listStyle = useAnimatedStyle(() => ({ opacity: shown.value }));
  const emptyStyle = useAnimatedStyle(() => ({ opacity: emptyShown.value }));
  // Fades ramp in over the first ~16px of hidden content on either side —
  // always mounted, opacity-only, gated by the list being visible at all.
  const leftFadeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, offsetX.value / 16)) * shown.value,
  }));
  const rightFadeStyle = useAnimatedStyle(() => ({
    opacity:
      Math.min(
        1,
        Math.max(0, (contentW.value - viewW.value - offsetX.value) / 16),
      ) * shown.value,
  }));

  return (
    <View style={styles.card}>
      <Animated.View style={[styles.listWrap, listStyle]}>
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          onScroll={onScroll}
          scrollEventThrottle={16}
          // Follow the game: when the row overflows, each appended move scrolls
          // the newest token into view. While everything fits there's nothing
          // to follow — scrolling then only causes jitter. Taps on earlier
          // moves don't change the content size, so scrubbing never fights
          // the user.
          onContentSizeChange={w => {
            contentW.value = w;
            if (w > viewW.value) {
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onLayout={(e: LayoutChangeEvent) => {
            viewW.value = e.nativeEvent.layout.width;
          }}>
          <HighlightPill />
          {moves.map((san, ply) => (
            <MoveCell key={ply} ply={ply} san={san} />
          ))}
        </Animated.ScrollView>
      </Animated.View>

      {/* Edge fades — always mounted, opacity driven from scroll position. */}
      <Animated.View
        style={[styles.fade, styles.fadeLeft, leftFadeStyle]}
        pointerEvents="none">
        <LinearGradient
          colors={[FADE_SOLID, FADE_CLEAR]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <Animated.View
        style={[styles.fade, styles.fadeRight, rightFadeStyle]}
        pointerEvents="none">
        <LinearGradient
          colors={[FADE_CLEAR, FADE_SOLID]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>

      {/* Empty caption — always mounted, cross-fades with the list. */}
      <Animated.View
        style={[styles.emptyWrap, emptyStyle]}
        pointerEvents="none">
        <Text style={styles.empty}>No moves yet</Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surfaceHi,
    borderColor: theme.border,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: HAIRLINE,
    height: 52,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  empty: {
    color: theme.textFaint,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  emptyWrap: {
    alignItems: 'center',
    bottom: 0,
    justifyContent: 'center',
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  fade: {
    bottom: 0,
    position: 'absolute',
    top: 0,
    width: 28,
  },
  fadeLeft: {
    left: 0,
  },
  fadeRight: {
    right: 0,
  },
  listWrap: {
    height: '100%',
    justifyContent: 'center',
  },
  no: {
    color: theme.textFaint,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  pill: {
    backgroundColor: withAlpha(theme.accent, 0.18),
    borderCurve: 'continuous',
    borderRadius: 8,
    left: 0,
    position: 'absolute',
    top: 0,
  },
  row: {
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  san: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  sanHit: {
    borderCurve: 'continuous',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
});

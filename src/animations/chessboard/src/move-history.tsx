import {
  LayoutChangeEvent,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import React, { memo, useEffect } from 'react';

import { useAtomValue, useSetAtom } from 'jotai';
import { PressableScale } from 'pressto';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
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
import { theme } from './theme';

const HAIRLINE = StyleSheet.hairlineWidth;
const SPRING = { duration: 200, easing: Easing.out(Easing.cubic) };
const FADE = { duration: 180, easing: Easing.out(Easing.cubic) };
const SAN_DIM = 'rgba(240,242,245,0.4)';

const MoveCell = memo<{ ply: number; san: string }>(({ ply, san }) => {
  const selected = useAtomValue(isPlySelectedFamily(ply));
  const select = useSetAtom(selectMoveAtom);
  const setFrame = useSetAtom(plyFrameFamily(ply));
  const isWhite = ply % 2 === 0;

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
      {isWhite ? <Text style={styles.no}>{ply / 2 + 1}.</Text> : null}
      <View onLayout={(e: LayoutChangeEvent) => setFrame(e.nativeEvent.layout)}>
        <PressableScale onPress={() => select(ply)} style={styles.sanHit}>
          <Animated.Text style={[styles.san, textStyle]}>{san}</Animated.Text>
        </PressableScale>
      </View>
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
// never on selection.
export const MoveHistory: React.FC = () => {
  const moves = useAtomValue(movesAtom);

  if (moves.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.empty}>No moves yet</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}>
        <HighlightPill />
        {moves.map((san, ply) => (
          <MoveCell key={ply} ply={ply} san={san} />
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: HAIRLINE,
    height: 52,
    justifyContent: 'center',
  },
  empty: {
    color: theme.textFaint,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    letterSpacing: 0.1,
    paddingHorizontal: 14,
  },
  no: {
    color: theme.textFaint,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  pill: {
    backgroundColor: 'rgba(58,145,248,0.18)',
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

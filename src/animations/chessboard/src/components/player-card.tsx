import { Image, StyleSheet, Text, View } from 'react-native';

import React from 'react';

import ColorLib from 'color';
import { useAtomValue } from 'jotai';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CLOCKS, PIECE_IMG, PLAYERS, VALUE } from '../constants';
import { capturedAtom, gameOverSv, gameResultAtom, turnSv } from '../state';
import { avatar, theme, withAlpha } from '../theme';
import { toRgba } from '../utils';

import type { Side } from '../types';

const HAIRLINE = StyleSheet.hairlineWidth;

// Pre-resolved RGB triplets so the active/idle cross-fade animates ALPHA only
// (rgb held constant) — pure opacity ramp, no hue path through interpolateColor,
// which is what caused the flicker. The active tint fades in over the static
// idle base instead of swapping the whole colour.
const SURFACE_RGB = ColorLib(theme.surface).rgb().array();
const BORDER_RGB = ColorLib(theme.border).rgb().array();

const CaptureTray: React.FC<{ pieces: string[]; lead: number; foe: Side }> = ({
  pieces,
  lead,
  foe,
}) => {
  // Value-sorted so the tray reads pawns → minors → majors, with a slight
  // chess.com-style overlap. Images are the board's own piece artwork.
  const sorted = [...pieces].sort((a, b) => (VALUE[a] ?? 0) - (VALUE[b] ?? 0));
  return (
    <View style={styles.tray}>
      {sorted.length > 0 ? (
        <View style={styles.trayPieces}>
          {sorted.map((p, i) => (
            <Image
              key={`${p}-${i}`}
              source={PIECE_IMG[foe][p]}
              style={[styles.trayPiece, i > 0 && styles.trayPieceOverlap]}
            />
          ))}
        </View>
      ) : null}
      {lead > 0 ? <Text style={styles.trayLead}>+{lead}</Text> : null}
    </View>
  );
};

export const PlayerCard: React.FC<{ side: Side; clock?: string }> = ({
  side,
  clock = CLOCKS[side],
}) => {
  const { name, rating } = PLAYERS[side];
  const foe: Side = side === 'w' ? 'b' : 'w';

  // React subscriptions are limited to what actually needs a re-render:
  // captures (rare) and the end-of-game result (fires exactly once, at mate).
  // The per-move turn treatment runs entirely on shared values below.
  const capturedAll = useAtomValue(capturedAtom);
  const winner = useAtomValue(gameResultAtom);

  const captured = capturedAll[side];
  const matW = capturedAll.w.reduce((s, p) => s + (VALUE[p] ?? 0), 0);
  const matB = capturedAll.b.reduce((s, p) => s + (VALUE[p] ?? 0), 0);
  const lead =
    side === 'w' ? Math.max(0, matW - matB) : Math.max(0, matB - matW);
  const result: 'win' | 'lose' | null = winner
    ? winner === side
      ? 'win'
      : 'lose'
    : null;

  // Active-turn state drives every active/idle transition on one shared value
  // so the card bg, border, clock bg and clock text all cross-fade together
  // (instead of snapping) when the turn changes. The whole chain reacts to the
  // turn/game-over shared values on the UI thread — no React involved.
  const active = useSharedValue(0);
  // Indicator breathes while it's this side's turn, so the screen has life
  // between moves.
  const pulse = useSharedValue(0);
  useAnimatedReaction(
    () => !gameOverSv.get() && turnSv.get() === side,
    (toMove, prev) => {
      if (prev !== null && toMove === prev) return;
      active.set(withTiming(toMove ? 1 : 0, { duration: 280 }));
      if (toMove) {
        pulse.set(
          withRepeat(
            withTiming(1, {
              duration: 950,
              easing: Easing.inOut(Easing.ease),
            }),
            -1,
            true,
          ),
        );
      } else {
        pulse.set(withTiming(0, { duration: 200 }));
      }
    },
  );

  // Card bg + border: fade the active surface/border IN (alpha 0 → 1) over the
  // transparent idle base — rgb is constant, so it's a clean opacity ramp.
  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: toRgba(SURFACE_RGB, active.get()),
    borderColor: toRgba(BORDER_RGB, active.get()),
  }));
  // Clock keeps its static surfaceHi base; the green tint just fades in on top.
  const clockTintStyle = useAnimatedStyle(() => ({ opacity: active.get() }));
  const clockTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      active.get(),
      [0, 1],
      [theme.textMuted, theme.text],
    ),
  }));
  // Dot stays mounted at all times — its width/margin animate from 0, so the
  // clock grows/shrinks smoothly per-frame on the UI thread (no mount/unmount,
  // no layout transition, no flicker).
  const dotStyle = useAnimatedStyle(() => ({
    width: active.get() * 6,
    marginRight: active.get() * 6,
    opacity: active.get() * (0.45 + pulse.get() * 0.55),
    transform: [{ scale: 0.8 + pulse.get() * 0.5 }],
  }));

  return (
    <Animated.View style={[styles.player, cardStyle]}>
      <Image source={avatar[side]} style={styles.avatar} />
      <View style={styles.playerInfo}>
        <View style={styles.playerNameRow}>
          <Text style={styles.playerName}>{name}</Text>
          <Text style={styles.playerRating}>{rating}</Text>
          {result ? (
            <Text
              style={[
                styles.resultTag,
                result === 'win' ? styles.resultWin : styles.resultLose,
              ]}>
              {result === 'win' ? 'WON' : 'LOST'}
            </Text>
          ) : null}
        </View>
        <CaptureTray pieces={captured} lead={lead} foe={foe} />
      </View>
      <View style={styles.clock}>
        <Animated.View
          style={[styles.clockTint, clockTintStyle]}
          pointerEvents="none"
        />
        <Animated.View style={[styles.clockDot, dotStyle]} />
        <Animated.Text style={[styles.clockText, clockTextStyle]}>
          {clock}
        </Animated.Text>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.14)',
    borderCurve: 'continuous',
    borderRadius: 12,
    borderWidth: HAIRLINE,
    height: 40,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 40,
  },
  clock: {
    alignItems: 'center',
    backgroundColor: theme.surfaceHi,
    borderCurve: 'continuous',
    // Concentric with the card: outer radius 18 − 6 inset = 12 (same rule as
    // the avatar), so the nested corners share a centre and never look broken.
    borderRadius: 12,
    flexDirection: 'row',
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 9,
  },
  clockDot: {
    backgroundColor: theme.accent,
    borderRadius: 3,
    height: 6,
  },
  clockText: {
    color: theme.textMuted,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  clockTint: {
    backgroundColor: withAlpha(theme.accent, 0.15),
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  player: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: HAIRLINE,
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 6,
    paddingVertical: 6,
    width: '100%',
  },
  playerInfo: {
    flex: 1,
    gap: 3,
  },
  playerName: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.1,
  },
  playerNameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  playerRating: {
    color: theme.textMuted,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
    letterSpacing: 0.2,
  },
  resultLose: {
    backgroundColor: withAlpha(theme.lose, 0.15),
    color: theme.lose,
  },
  resultTag: {
    borderCurve: 'continuous',
    borderRadius: 5,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resultWin: {
    backgroundColor: withAlpha(theme.accent, 0.15),
    color: theme.accent,
  },
  tray: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 5,
    minHeight: 16,
  },
  trayLead: {
    color: theme.textMuted,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  trayPiece: {
    height: 16,
    width: 16,
  },
  trayPieceOverlap: {
    marginLeft: -5,
  },
  trayPieces: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});

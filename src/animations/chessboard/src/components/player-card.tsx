import { Image, StyleSheet, Text, View } from 'react-native';

import React, { useEffect } from 'react';

import ColorLib from 'color';
import { useAtomValue } from 'jotai';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CLOCKS, GLYPH, PLAYERS, VALUE } from '../constants';
import { capturedAtom, pliesAtom, statusAtom } from '../state';
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
}) => (
  <View style={styles.tray}>
    {pieces.length > 0 ? (
      <Text style={styles.trayPieces}>
        {pieces.map(p => GLYPH[foe][p]).join('')}
      </Text>
    ) : null}
    {lead > 0 ? <Text style={styles.trayLead}>+{lead}</Text> : null}
  </View>
);

export const PlayerCard: React.FC<{ side: Side; clock?: string }> = ({
  side,
  clock = CLOCKS[side],
}) => {
  const { name, rating } = PLAYERS[side];
  const foe: Side = side === 'w' ? 'b' : 'w';

  // Everything that drives the card is read straight from the atoms, so the
  // card only re-renders when captures/status actually change (during the
  // replay) — never when the user scrubs the move history.
  const capturedAll = useAtomValue(capturedAtom);
  const gameStatus = useAtomValue(statusAtom);
  const plyCount = useAtomValue(pliesAtom).length;

  const captured = capturedAll[side];
  const gameOver = gameStatus === 'Checkmate' || gameStatus === 'Stalemate';
  const toMove =
    !gameOver && (plyCount % 2 === 0 ? side === 'w' : side === 'b');
  const matW = capturedAll.w.reduce((s, p) => s + (VALUE[p] ?? 0), 0);
  const matB = capturedAll.b.reduce((s, p) => s + (VALUE[p] ?? 0), 0);
  const lead =
    side === 'w' ? Math.max(0, matW - matB) : Math.max(0, matB - matW);
  // On checkmate the side to move is the one mated; the mover wins.
  const matedSide: Side | null =
    gameStatus === 'Checkmate' ? (plyCount % 2 === 0 ? 'w' : 'b') : null;
  const result: 'win' | 'lose' | null = matedSide
    ? matedSide === side
      ? 'lose'
      : 'win'
    : null;

  // Active-turn state drives every active/idle transition on one shared value
  // so the card bg, border, clock bg and clock text all cross-fade together
  // (instead of snapping) when the turn changes.
  const active = useSharedValue(toMove ? 1 : 0);
  // Indicator breathes while it's this side's turn, so the screen has life
  // between moves.
  const pulse = useSharedValue(0);
  useEffect(() => {
    active.value = withTiming(toMove ? 1 : 0, { duration: 280 });
    if (toMove) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 950, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      pulse.value = withTiming(0, { duration: 200 });
    }
  }, [toMove, active, pulse]);

  // Card bg + border: fade the active surface/border IN (alpha 0 → 1) over the
  // transparent idle base — rgb is constant, so it's a clean opacity ramp.
  const cardStyle = useAnimatedStyle(() => ({
    backgroundColor: toRgba(SURFACE_RGB, active.value),
    borderColor: toRgba(BORDER_RGB, active.value),
  }));
  // Clock keeps its static surfaceHi base; the green tint just fades in on top.
  const clockTintStyle = useAnimatedStyle(() => ({ opacity: active.value }));
  const clockTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      active.value,
      [0, 1],
      [theme.textMuted, theme.text],
    ),
  }));
  // Dot stays mounted at all times — its width/margin animate from 0, so the
  // clock grows/shrinks smoothly per-frame on the UI thread (no mount/unmount,
  // no layout transition, no flicker).
  const dotStyle = useAnimatedStyle(() => ({
    width: active.value * 6,
    marginRight: active.value * 6,
    opacity: active.value * (0.45 + pulse.value * 0.55),
    transform: [{ scale: 0.8 + pulse.value * 0.5 }],
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
    borderRadius: 9,
    flexDirection: 'row',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 7,
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
  trayPieces: {
    color: theme.textMuted,
    fontSize: 15,
    lineHeight: 17,
  },
});

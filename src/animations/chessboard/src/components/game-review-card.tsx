import { Image, StyleSheet, Text, View } from 'react-native';

import React from 'react';

import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PressableScale } from 'pressto';
import Animated, {
  Easing,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { avatar, quality, theme } from '../theme';

import type { Quality, ShowOpts } from '../types';
import type { StyleProp, ViewStyle } from 'react-native';

const HAIRLINE = StyleSheet.hairlineWidth;

const QUALITY: Record<
  Quality,
  { glyph: string; color: string; label: string }
> = {
  brilliant: { glyph: '!!', color: quality.brilliant, label: 'Brilliant' },
  great: { glyph: '!', color: quality.great, label: 'Great' },
  book: { glyph: '⌑', color: quality.book, label: 'Book' },
  best: { glyph: '★', color: quality.best, label: 'Best' },
  excellent: { glyph: '✓', color: quality.excellent, label: 'Excellent' },
  good: { glyph: '✓', color: quality.good, label: 'Good' },
  inaccuracy: { glyph: '?!', color: quality.inaccuracy, label: 'Inaccuracy' },
  mistake: { glyph: '?', color: quality.mistake, label: 'Mistake' },
  miss: { glyph: '✕', color: quality.miss, label: 'Miss' },
  blunder: { glyph: '??', color: quality.blunder, label: 'Blunder' },
};
// Rows shown in the recap table, best → worst (chess.com order).
const TABLE_ORDER: Quality[] = [
  'brilliant',
  'great',
  'book',
  'best',
  'excellent',
  'good',
  'inaccuracy',
  'mistake',
  'miss',
  'blunder',
];

// Staggered entrance — a subtle fade + small slide + faint scale on one
// ease-out-quart curve (no bounce), tight stagger. Present but understated.
const ENTER_CFG = { duration: 400, easing: Easing.bezier(0.16, 0.84, 0.44, 1) };
const enter = (delay: number) => () => {
  'worklet';
  return {
    initialValues: {
      opacity: 0,
      transform: [{ translateY: 9 }, { scale: 0.985 }] as [
        { translateY: number },
        { scale: number },
      ],
    },
    animations: {
      opacity: withDelay(delay, withTiming(1, ENTER_CFG)),
      transform: [
        { translateY: withDelay(delay, withTiming(0, ENTER_CFG)) },
        { scale: withDelay(delay, withTiming(1, ENTER_CFG)) },
      ] as unknown as [{ translateY: number }, { scale: number }],
    },
  };
};

// The post-game review panel: players, accuracy, the move-quality breakdown and
// the Review / Rematch actions. Each section cascades in via enter(); the
// container's blur-into-focus is driven by the parent through `style`.
export const GameReviewCard: React.FC<{
  card: ShowOpts;
  style: StyleProp<ViewStyle>;
  onHide: () => void;
}> = ({ card, style, onHide }) => {
  const rows = TABLE_ORDER.map(q => ({
    q,
    you: card.moves.filter((m, i) => i % 2 === 0 && m.quality === q).length,
    opp: card.moves.filter((m, i) => i % 2 === 1 && m.quality === q).length,
  })).filter(r => r.you + r.opp > 0);

  return (
    <Animated.View style={[styles.cardWrap, style]}>
      <Animated.View entering={enter(0)}>
        <Text style={styles.recapKicker}>GAME REVIEW</Text>
        <Text style={styles.recapTitle}>{card.subtitle}</Text>
      </Animated.View>

      {/* Player names */}
      <Animated.View entering={enter(55)} style={styles.hRow}>
        <View style={styles.hLabel} />
        <Text style={styles.hName}>enzo</Text>
        <View style={styles.iconCol} />
        <Text style={styles.hName} numberOfLines={1}>
          {card.oppName}
        </Text>
      </Animated.View>

      {/* Players — avatars */}
      <Animated.View entering={enter(95)} style={styles.hRow}>
        <Text style={styles.hRowLabel}>Players</Text>
        <View style={styles.col}>
          <Image source={avatar.w} style={styles.avatar} />
        </View>
        <View style={styles.iconCol} />
        <View style={styles.col}>
          <Image source={avatar.b} style={styles.avatar} />
        </View>
      </Animated.View>

      {/* Accuracy — pills */}
      <Animated.View
        entering={enter(135)}
        style={[styles.hRow, styles.hRowAcc]}>
        <Text style={styles.hRowLabel}>Accuracy</Text>
        <View style={styles.col}>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{card.accuracy.you.toFixed(1)}</Text>
          </View>
        </View>
        <View style={styles.iconCol} />
        <View style={styles.col}>
          <View style={[styles.pill, styles.pillWin]}>
            <Text style={styles.pillTextWin}>
              {card.accuracy.opp.toFixed(1)}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.View entering={enter(170)}>
        <View style={styles.tableDivider} />
      </Animated.View>

      {/* Quality breakdown — only categories that actually occurred. */}
      {rows.map((r, i) => {
        const c = QUALITY[r.q];
        return (
          <Animated.View
            key={r.q}
            entering={enter(210 + i * 50)}
            style={styles.qRow}>
            <Text style={[styles.qLabel, { color: c.color }]}>{c.label}</Text>
            <Text
              style={[
                styles.qCount,
                r.you === 0 ? styles.qCountZero : { color: c.color },
              ]}>
              {r.you}
            </Text>
            <View style={styles.iconCol}>
              <View style={[styles.qIcon, { backgroundColor: c.color }]}>
                <Text style={styles.qGlyph}>{c.glyph}</Text>
              </View>
            </View>
            <Text
              style={[
                styles.qCount,
                r.opp === 0 ? styles.qCountZero : { color: c.color },
              ]}>
              {r.opp}
            </Text>
          </Animated.View>
        );
      })}

      <Animated.View entering={enter(470)} style={styles.cardActions}>
        <PressableScale
          onPress={() => {
            onHide();
            card.onReview();
          }}
          style={[styles.btn, styles.btnGhost]}>
          <MaterialCommunityIcons
            name="eye-outline"
            size={18}
            color={theme.text}
          />
          <Text style={styles.btnGhostText}>Review</Text>
        </PressableScale>
        <PressableScale
          onPress={() => {
            onHide();
            card.onRematch();
          }}
          style={[styles.btn, styles.btnPrimary]}>
          <MaterialCommunityIcons
            name="sword-cross"
            size={18}
            color={theme.bg}
          />
          <Text style={styles.btnPrimaryText}>Rematch</Text>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    borderColor: 'rgba(255,255,255,0.14)',
    borderCurve: 'continuous',
    borderRadius: 11,
    borderWidth: HAIRLINE,
    height: 38,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 38,
  },
  btn: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  btnGhost: {
    backgroundColor: 'rgba(240,242,245,0.08)',
    borderColor: 'rgba(240,242,245,0.16)',
    borderWidth: HAIRLINE,
  },
  btnGhostText: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '600',
  },
  btnPrimary: {
    backgroundColor: theme.text,
  },
  btnPrimaryText: {
    color: theme.bg,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 24,
  },
  cardWrap: {
    bottom: 40,
    left: 22,
    position: 'absolute',
    right: 22,
  },
  col: {
    alignItems: 'center',
    width: 62,
  },
  hLabel: { flex: 1 },
  hName: {
    color: theme.textMuted,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
    width: 62,
  },
  hRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 44,
  },
  hRowAcc: {
    marginBottom: 2,
  },
  hRowLabel: {
    color: theme.textMuted,
    flex: 1,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 14,
    fontWeight: '600',
  },
  iconCol: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
  },
  pill: {
    alignItems: 'center',
    backgroundColor: 'rgba(240,242,245,0.10)',
    borderCurve: 'continuous',
    borderRadius: 9,
    paddingVertical: 8,
    width: 56,
  },
  pillText: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  pillTextWin: {
    color: theme.bg,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '800',
  },
  pillWin: {
    backgroundColor: theme.accent,
  },
  qCount: {
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 17,
    fontVariant: ['tabular-nums'],
    fontWeight: '700',
    textAlign: 'center',
    width: 62,
  },
  qCountZero: {
    color: theme.textFaint,
    fontWeight: '500',
  },
  qGlyph: {
    color: theme.bg,
    fontSize: 14,
    fontWeight: '900',
  },
  qIcon: {
    alignItems: 'center',
    borderRadius: 14,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  qLabel: {
    flex: 1,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  qRow: {
    alignItems: 'center',
    flexDirection: 'row',
    height: 50,
  },
  recapKicker: {
    color: theme.textMuted,
    fontFamily: 'SF-Pro-Rounded-Heavy',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },
  recapTitle: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Heavy',
    fontSize: 26,
    fontWeight: '800', // SF Heavy
    letterSpacing: -0.9,
    marginBottom: 16,
    marginTop: 5,
  },
  tableDivider: {
    backgroundColor: theme.border,
    height: HAIRLINE,
    marginBottom: 4,
    marginTop: 8,
  },
});

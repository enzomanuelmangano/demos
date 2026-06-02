import {
  Image,
  StyleSheet,
  View,
  Text,
  ScrollView,
  useWindowDimensions,
} from 'react-native';

import React, { useRef, useEffect, useState, useCallback, memo } from 'react';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import ColorLib from 'color';
import { PressableScale } from 'pressto';
import Chessboard, { ChessboardRef, MoveResult } from 'react-native-chessboard';
import Animated, {
  interpolateColor,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CheckmateAuraProvider,
  useCheckmateAura,
  type AnnotatedMove,
} from './checkmate-aura';
import { avatarUri, theme } from './theme';

type Color = 'w' | 'b';
type Side = 'w' | 'b';

// Pre-resolved RGB triplets so the active/idle cross-fade animates ALPHA only
// (rgb held constant) — pure opacity ramp, no hue path through interpolateColor,
// which is what caused the flicker. The active tint fades in over the static
// idle base instead of swapping the whole colour.
const SURFACE_RGB = ColorLib(theme.surface).rgb().array();
const BORDER_RGB = ColorLib(theme.border).rgb().array();
const CLOCK_TINT = ColorLib(theme.accent).alpha(0.15).rgb().string();
const toRgba = (rgb: number[], a: number) => {
  'worklet';
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
};

const PLAYERS: Record<Side, { name: string; rating: number }> = {
  b: { name: 'nimzoknight', rating: 2218 },
  w: { name: 'you', rating: 2190 },
};

// Solid glyphs per colour, indexed by piece type — used in capture trays.
const GLYPH: Record<Side, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
};
const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

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

const PlayerCard: React.FC<{
  side: Side;
  captured: string[];
  lead: number;
  toMove: boolean;
  clock: string;
  result?: 'win' | 'lose' | null;
}> = ({ side, captured, lead, toMove, clock, result }) => {
  const { name, rating } = PLAYERS[side];
  const foe: Side = side === 'w' ? 'b' : 'w';

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
      <Image source={{ uri: avatarUri[side] }} style={styles.avatar} />
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

// Single horizontal gutter shared by the board and all chrome, so every
// left/right edge lines up.
const GUTTER = 16;

// Board themed off the same OKLCH ramp as the UI: slate squares, accent-blue
// last-move, red mate — all in the shared hue family.
const BOARD_COLORS = {
  white: theme.boardLight,
  black: theme.boardDark,
  lastMoveHighlight: 'rgba(58,145,248,0.40)', // theme.accent @ 0.40
  checkmateHighlight: theme.lose,
};

// The board is isolated behind React.memo so the chrome's per-move state
// updates (status / moves / captured) never reconcile the Chessboard
// subtree. Its props are all stable — it re-renders only on flip / resize.
const Board = memo(function Board({
  chessRef,
  boxRef,
  boardSize,
  flipped,
  onMove,
}: {
  chessRef: React.RefObject<ChessboardRef | null>;
  boxRef: React.RefObject<View | null>;
  boardSize: number;
  flipped: boolean;
  onMove: (result: MoveResult) => void;
}) {
  return (
    <View ref={boxRef} collapsable={false}>
      <Chessboard
        ref={chessRef}
        boardSize={boardSize}
        flipped={flipped}
        onMove={onMove}
        colors={BOARD_COLORS}
      />
    </View>
  );
});

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Measure a view's frame in window (screen) coordinates, as a promise.
const measureInWindow = (
  ref: React.RefObject<View | null>,
): Promise<{ x: number; y: number; width: number; height: number } | null> =>
  new Promise(resolve => {
    const node = ref.current;
    if (!node) return resolve(null);
    node.measureInWindow((x, y, width, height) =>
      resolve({ x, y, width, height }),
    );
  });

// Locate a king on the board from the FEN placement field. Returns the
// 0-based file (a→0) and row-from-top (rank 8 → 0), matching the board's
// internal squareToIndex convention before any flip is applied.
const kingFromFen = (
  fen: string,
  color: Color,
): { file: number; rowFromTop: number } | null => {
  const placement = fen.split(' ')[0];
  const ranks = placement.split('/'); // ranks[0] = rank 8 = top row
  const target = color === 'w' ? 'K' : 'k';
  for (let row = 0; row < ranks.length; row++) {
    let file = 0;
    for (const ch of ranks[row]) {
      if (ch >= '1' && ch <= '9') {
        file += parseInt(ch, 10);
      } else {
        if (ch === target) return { file, rowFromTop: row };
        file += 1;
      }
    }
  }
  return null;
};

const FOOLS_MATE: Array<[string, string]> = [
  ['f2', 'f3'],
  ['e7', 'e5'],
  ['g2', 'g4'],
  ['d8', 'h4'],
];

// Canned post-game analysis for Fool's Mate (a real engine eval would produce
// these). 1. f3 (weakens the king) e5  2. g4?? (allows mate) Qh4#.
const REVIEW_MOVES: AnnotatedMove[] = [
  { san: 'f3', quality: 'inaccuracy' },
  { san: 'e5', quality: 'best' },
  { san: 'g4', quality: 'blunder' },
  { san: 'Qh4#', quality: 'brilliant' },
];
const REVIEW_ACCURACY = { you: 24.5, opp: 98.6 };

function GameScreen() {
  const ref = useRef<ChessboardRef>(null);
  const boardBoxRef = useRef<View>(null);
  const runningRef = useRef(false);
  const { show } = useCheckmateAura();

  const [status, setStatus] = useState('White to move');
  const [moves, setMoves] = useState<string[]>([]);
  const [captured, setCaptured] = useState<{ w: string[]; b: string[] }>({
    w: [],
    b: [],
  });
  const [flipped, setFlipped] = useState(false);
  const { width } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();
  // Board spans the full screen width — the hero. Chrome is inset to GUTTER.
  const boardSize = width;
  const pieceSize = boardSize / 8;

  const playSequence = useCallback(async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    ref.current?.resetBoard();
    setMoves([]);
    setCaptured({ w: [], b: [] });
    setStatus('White to move');
    await delay(700);
    for (const [from, to] of FOOLS_MATE) {
      await ref.current?.move({ from: from as any, to: to as any });
      await delay(450);
    }
    runningRef.current = false;
  }, []);

  // Rematch: reset to a fresh, playable board — no canned replay.
  const rematch = useCallback(() => {
    if (runningRef.current) return;
    ref.current?.resetBoard();
    setMoves([]);
    setCaptured({ w: [], b: [] });
    setStatus('White to move');
  }, []);

  // Checkmate → settle the board into a blurred haze with a breathing
  // accent-blue aurora centred on the mated king, and raise a calm result
  // card. Atmosphere, not a shockwave.
  const showAura = useCallback(
    async (fen: string, moverColor: Color) => {
      const kingColor: Color = moverColor === 'w' ? 'b' : 'w';
      const king = kingFromFen(fen, kingColor);
      if (!king) return;
      const box = await measureInWindow(boardBoxRef);
      if (!box) return;
      const col = flipped ? 7 - king.file : king.file;
      const row = flipped ? 7 - king.rowFromTop : king.rowFromTop;
      // The mover delivered mate, so the mover wins.
      const winner = PLAYERS[moverColor].name;
      show({
        x: box.x + col * pieceSize + pieceSize / 2,
        y: box.y + row * pieceSize + pieceSize / 2,
        subtitle: `${winner} wins`,
        oppName: PLAYERS.b.name,
        accuracy: REVIEW_ACCURACY,
        moves: REVIEW_MOVES,
        onRematch: rematch,
        onReview: () => {}, // dismiss to inspect the final board
      });
    },
    [flipped, pieceSize, show, rematch],
  );

  const handleMove = useCallback(
    (result: MoveResult) => {
      setMoves(prev => [...prev, result.move.san]);
      const taken = (result.move as { captured?: string }).captured;
      if (taken) {
        const by = result.move.color as Side;
        setCaptured(prev => ({ ...prev, [by]: [...prev[by], taken] }));
      }
      const { isCheckmate, isStalemate, isCheck } = result.state;
      const nextStatus = isCheckmate
        ? 'Checkmate'
        : isStalemate
          ? 'Stalemate'
          : isCheck
            ? 'Check'
            : result.move.color === 'w'
              ? 'Black to move'
              : 'White to move';
      setStatus(nextStatus);

      // Only checkmate earns the aura — check/stalemate just update the status.
      if (isCheckmate) {
        // Wait out the move spring (~300ms) so the captured frame shows the
        // piece landed.
        setTimeout(() => showAura(result.state.fen, result.move.color), 480);
      }
    },
    [showAura],
  );

  useEffect(() => {
    playSequence();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Group SAN into numbered "1. f3 e5" tokens for the history strip. Track each
  // SAN's flat index so the latest (active) move can be shown full-white while
  // earlier moves dim to a low-opacity white.
  const lastMoveIdx = moves.length - 1;
  const moveTokens: {
    no: number;
    white: string;
    whiteIdx: number;
    black?: string;
    blackIdx: number;
  }[] = [];
  for (let i = 0; i < moves.length; i += 2) {
    moveTokens.push({
      no: i / 2 + 1,
      white: moves[i],
      whiteIdx: i,
      black: moves[i + 1],
      blackIdx: i + 1,
    });
  }

  // Derived game info for the player cards.
  const gameOver = status === 'Checkmate' || status === 'Stalemate';
  const turn: Side | null = gameOver
    ? null
    : moves.length % 2 === 0
      ? 'w'
      : 'b';
  const matW = captured.w.reduce((s, p) => s + (VALUE[p] ?? 0), 0);
  const matB = captured.b.reduce((s, p) => s + (VALUE[p] ?? 0), 0);
  const leadW = Math.max(0, matW - matB);
  const leadB = Math.max(0, matB - matW);
  // On checkmate the side to move is the one mated; the mover wins.
  const matedSide: Side | null =
    status === 'Checkmate' ? (moves.length % 2 === 0 ? 'w' : 'b') : null;
  const resultFor = (s: Side): 'win' | 'lose' | null =>
    matedSide ? (matedSide === s ? 'lose' : 'win') : null;

  return (
    <View style={styles.root}>
      {/* In-app header — title, live status caption, flip action (top-right,
          clear of the drawer icon that overlays the top-left corner). */}
      <View style={[styles.header, { paddingTop: safeTop + 6 }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.navTitle}>Fool’s Mate</Text>
          <Text style={styles.navSub} numberOfLines={1}>
            {status}
          </Text>
        </View>
        <PressableScale
          hitSlop={16}
          onPress={() => setFlipped(f => !f)}
          style={styles.flipBtn}>
          <Ionicons name="swap-vertical" size={23} color={theme.accent} />
        </PressableScale>
      </View>

      <View style={styles.content}>
        <View style={styles.topGroup}>
          {/* Opponent (black) — top */}
          <View style={styles.playerWrap}>
            <PlayerCard
              key="b"
              side="b"
              captured={captured.b}
              lead={leadB}
              toMove={turn === 'b'}
              clock="2:46"
              result={resultFor('b')}
            />
          </View>

          {/* Board */}
          <View style={styles.boardHero}>
            <Board
              chessRef={ref}
              boxRef={boardBoxRef}
              boardSize={boardSize}
              flipped={flipped}
              onMove={handleMove}
            />
          </View>

          {/* You (white) — bottom */}
          <View style={styles.playerWrap}>
            <PlayerCard
              key="w"
              side="w"
              captured={captured.w}
              lead={leadW}
              toMove={turn === 'w'}
              clock="3:09"
              result={resultFor('w')}
            />
          </View>
        </View>

        {/* Bottom group — move history sits directly above the actions. */}
        <View style={styles.bottomGroup}>
          {/* Move history */}
          <View style={styles.moveListWrap}>
            <View style={[styles.glass, styles.historyCard]}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.historyRow}>
                {moveTokens.length === 0 ? (
                  <Text style={styles.historyEmpty}>No moves yet</Text>
                ) : (
                  moveTokens.map(t => (
                    <View key={t.no} style={styles.moveToken}>
                      <Text style={styles.moveNo}>{t.no}.</Text>
                      <Text
                        style={[
                          styles.moveSan,
                          t.whiteIdx !== lastMoveIdx && styles.moveSanPast,
                        ]}>
                        {t.white}
                      </Text>
                      {t.black ? (
                        <Text
                          style={[
                            styles.moveSan,
                            t.blackIdx !== lastMoveIdx && styles.moveSanPast,
                          ]}>
                          {t.black}
                        </Text>
                      ) : null}
                    </View>
                  ))
                )}
              </ScrollView>
            </View>
          </View>

          {/* Actions — a compact replay icon + the primary Rematch button. */}
          <View style={styles.actionRow}>
            <PressableScale onPress={playSequence} style={styles.iconButton}>
              <MaterialCommunityIcons
                name="replay"
                size={22}
                color={theme.text}
              />
            </PressableScale>
            <PressableScale
              onPress={rematch}
              style={[
                styles.actionButton,
                styles.actionSecondary,
                styles.actionFill,
              ]}>
              <MaterialCommunityIcons
                name="sword-cross"
                size={18}
                color={theme.text}
              />
              <Text style={styles.replayText}>Rematch</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </View>
  );
}

// The aura overlay covers this animation's subtree; the provider must wrap the
// screen so `useCheckmateAura` resolves and the checkmate haze can snapshot the
// board.
export const ChessboardGame = () => (
  <CheckmateAuraProvider>
    <GameScreen />
  </CheckmateAuraProvider>
);

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    paddingVertical: 15,
  },
  actionFill: {
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: GUTTER,
    width: '100%',
  },
  actionSecondary: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderWidth: HAIRLINE,
  },
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
  boardHero: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  bottomGroup: {
    gap: 10,
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
    backgroundColor: CLOCK_TINT,
    bottom: 0,
    left: 0,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  content: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 28,
    paddingTop: 12,
  },
  flipBtn: {
    bottom: 8,
    padding: 4,
    position: 'absolute',
    right: GUTTER,
  },
  glass: {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: HAIRLINE,
  },
  header: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    paddingBottom: 8,
    paddingHorizontal: GUTTER,
  },
  headerTitleWrap: {
    alignItems: 'center',
    flex: 1,
  },
  historyCard: {
    height: 42,
    justifyContent: 'center',
  },
  historyEmpty: {
    color: theme.textFaint,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    letterSpacing: 0.1,
  },
  historyRow: {
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
  },
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderCurve: 'continuous',
    borderRadius: 14,
    borderWidth: HAIRLINE,
    justifyContent: 'center',
    paddingVertical: 15,
    width: 54,
  },
  moveListWrap: {
    paddingHorizontal: GUTTER,
    width: '100%',
  },
  moveNo: {
    color: theme.textFaint,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 13,
    fontVariant: ['tabular-nums'],
    fontWeight: '500',
  },
  moveSan: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 14,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  moveSanPast: {
    color: 'rgba(240,242,245,0.4)',
  },
  moveToken: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  navSub: {
    color: theme.textMuted,
    fontFamily: 'SF-Compact-Rounded-Medium',
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.1,
    marginTop: 2,
  },
  navTitle: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  player: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderCurve: 'continuous',
    borderRadius: 14,
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
  playerWrap: {
    paddingHorizontal: 10,
    width: '100%',
  },
  replayText: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  resultLose: {
    backgroundColor: 'rgba(245,107,118,0.15)',
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
    backgroundColor: 'rgba(58,145,248,0.15)',
    color: theme.accent,
  },
  root: {
    backgroundColor: theme.bg,
    flex: 1,
  },
  topGroup: {
    alignItems: 'center',
    gap: 10,
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

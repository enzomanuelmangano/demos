import {
  Alert,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Provider, useAtomValue, useSetAtom } from 'jotai';
import { PressableScale } from 'pressto';
import Chessboard, { ChessboardRef, MoveResult } from 'react-native-chessboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckmateAuraProvider, useCheckmateAura } from './checkmate-aura';
import { PlayerCard } from './components/player-card';
import {
  BOARD_COLORS,
  CLOCKS,
  FATAL_ATTRACTION,
  PLAYERS,
  REVIEW_ACCURACY,
  REVIEW_MOVES,
} from './constants';
import { HistorySync } from './history-sync';
import { MoveHistory } from './move-history';
import {
  capturedAtom,
  gameOverSv,
  pliesAtom,
  resetGameAtom,
  runningAtom,
  selectedPlyAtom,
  statusAtom,
  turnSv,
} from './state';
import { theme } from './theme';
import { delay, kingFromFen, measureInWindow } from './utils';

import type { Side } from './types';

// Single horizontal gutter shared by the board and all chrome, so every
// left/right edge lines up.
const GUTTER = 16;

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

// Live status caption — a plain atom-driven Text. A ReText (TextInput-based)
// would avoid the re-render, but on the new architecture its native text
// updates occasionally flash unstyled (black) and clip to the previous width;
// an isolated leaf re-rendering once per move is the better trade.
const StatusCaption: React.FC = () => {
  const caption = useAtomValue(statusAtom);
  return (
    <Text style={styles.navSub} numberOfLines={1}>
      {caption}
    </Text>
  );
};

function GameScreen() {
  const ref = useRef<ChessboardRef>(null);
  const boardBoxRef = useRef<View>(null);
  const runningRef = useRef(false);
  // False once unmounted, so the async replay / aura timer bail instead of
  // driving a torn-down tree.
  const alive = useRef(true);
  const auraTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { show, hide } = useCheckmateAura();

  const setPlies = useSetAtom(pliesAtom);
  const setSelectedPly = useSetAtom(selectedPlyAtom);
  const setRunning = useSetAtom(runningAtom);
  const setCaptured = useSetAtom(capturedAtom);
  const setStatus = useSetAtom(statusAtom);
  const resetGame = useSetAtom(resetGameAtom);

  const [flipped, setFlipped] = useState(false);
  const { width } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();
  // Board spans the full screen width — the hero. Chrome is inset to GUTTER.
  const boardSize = width;
  const pieceSize = boardSize / 8;

  // Bumping the generation cancels any in-flight replay: the loop re-checks it
  // after every await and bails when it no longer matches.
  const replayGen = useRef(0);

  // Checkmate haptic crescendo — a choreographed pattern synced to the aura:
  // the mating strike, a rising drumroll while the board settles, a heavy
  // detonation as the wave launches, decaying shockwave ticks as the ring
  // expands, and a success note when the recap lands. Cancellable, so a reset
  // mid-sequence doesn't keep buzzing.
  const hapticTimers = useRef<Array<ReturnType<typeof setTimeout>>>([]);
  const cancelMateHaptics = useCallback(() => {
    hapticTimers.current.forEach(clearTimeout);
    hapticTimers.current = [];
  }, []);
  const playMateHaptics = useCallback(() => {
    cancelMateHaptics();
    const at = (t: number, fn: () => void) =>
      hapticTimers.current.push(setTimeout(fn, t));
    const impact = (style: Haptics.ImpactFeedbackStyle) => () =>
      Haptics.impactAsync(style);
    // The strike.
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    // Drumroll crescendo while the mating piece settles (snapshot at ~580ms).
    at(130, impact(Haptics.ImpactFeedbackStyle.Soft));
    at(240, impact(Haptics.ImpactFeedbackStyle.Light));
    at(340, impact(Haptics.ImpactFeedbackStyle.Light));
    at(430, impact(Haptics.ImpactFeedbackStyle.Medium));
    at(510, impact(Haptics.ImpactFeedbackStyle.Medium));
    at(570, impact(Haptics.ImpactFeedbackStyle.Rigid));
    // The wave detonates (~580ms timer + snapshot + a frame).
    at(700, impact(Haptics.ImpactFeedbackStyle.Heavy));
    // Shockwave decays with the expanding ring.
    at(850, impact(Haptics.ImpactFeedbackStyle.Medium));
    at(1000, impact(Haptics.ImpactFeedbackStyle.Light));
    at(1200, impact(Haptics.ImpactFeedbackStyle.Soft));
    // The recap settles in.
    at(1600, () =>
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    );
  }, [cancelMateHaptics]);

  const playSequence = useCallback(async () => {
    if (runningRef.current) return;
    const gen = ++replayGen.current;
    runningRef.current = true;
    setRunning(true);
    ref.current?.resetBoard();
    resetGame();
    await delay(300);
    for (const [from, to] of FATAL_ATTRACTION) {
      if (!alive.current || replayGen.current !== gen) return;
      await ref.current?.move({ from: from as any, to: to as any });
      if (!alive.current || replayGen.current !== gen) return;
      await delay(260);
    }
    if (replayGen.current !== gen) return;
    runningRef.current = false;
    setRunning(false);
  }, [resetGame, setRunning]);

  // Rematch: cancel whatever is in flight (replay, pending aura) and reset to
  // a fresh, playable board.
  const rematch = useCallback(() => {
    replayGen.current++;
    runningRef.current = false;
    setRunning(false);
    if (auraTimer.current != null) clearTimeout(auraTimer.current);
    cancelMateHaptics();
    hide();
    ref.current?.resetBoard();
    resetGame();
  }, [resetGame, setRunning, hide, cancelMateHaptics]);

  // New Game: confirm before clearing the current board (native alert). Works
  // mid-replay too — confirming aborts the replay and resets.
  const confirmNewGame = useCallback(() => {
    Alert.alert(
      'New Game?',
      'This clears the current board and starts fresh.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'New Game', style: 'destructive', onPress: rematch },
      ],
    );
  }, [rematch]);

  // Checkmate → settle the board into a blurred haze with a breathing
  // accent-blue aurora centred on the mated king, and raise a calm result
  // card. Atmosphere, not a shockwave.
  const showAura = useCallback(
    async (fen: string, moverColor: Side) => {
      const kingColor: Side = moverColor === 'w' ? 'b' : 'w';
      const king = kingFromFen(fen, kingColor);
      if (!king) return;
      const box = await measureInWindow(boardBoxRef);
      if (!box || !alive.current) return;
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
      setPlies(prev => [
        ...prev,
        {
          san: result.move.san,
          fen: result.state.fen,
          from: result.move.from,
          to: result.move.to,
        },
      ]);
      // Each landing move becomes the selected ply (-1 → 0 → 1 → …).
      setSelectedPly(s => s + 1);
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
      // Mirror the hot state onto shared values — the cards' turn treatment
      // animates from these without re-rendering.
      turnSv.set(result.move.color === 'w' ? 'b' : 'w');
      gameOverSv.set(isCheckmate || isStalemate);

      // Tactile read of the game: a soft tick per move, firmer on captures,
      // sharp on checks — and the full crescendo on mate.
      if (isCheckmate) {
        playMateHaptics();
      } else if (taken) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else if (isCheck) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);
      } else {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      // Only checkmate earns the aura — check/stalemate just update the status.
      if (isCheckmate) {
        // makeImageFromView rasterizes the whole view hierarchy on the main
        // thread, so it inevitably eats a frame — schedule it past the move
        // spring (~430ms) and the history scroll settle, when the screen is
        // fully static and the dropped frame can't be seen.
        auraTimer.current = setTimeout(
          () => showAura(result.state.fen, result.move.color as Side),
          580,
        );
      }
    },
    [
      showAura,
      playMateHaptics,
      setPlies,
      setSelectedPly,
      setCaptured,
      setStatus,
    ],
  );

  useEffect(() => {
    alive.current = true;
    playSequence();
    return () => {
      alive.current = false;
      if (auraTimer.current != null) clearTimeout(auraTimer.current);
      cancelMateHaptics();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // flipped=false shows white at the bottom (standard); flipped swaps it. Keep
  // the player cards on the same side as their pieces.
  const topSide: Side = flipped ? 'w' : 'b';
  const bottomSide: Side = flipped ? 'b' : 'w';

  return (
    <View style={styles.root}>
      {/* In-app header — title, live status caption, flip action (top-right,
          clear of the drawer icon that overlays the top-left corner). */}
      <View style={[styles.header, { paddingTop: safeTop + 6 }]}>
        <View style={styles.headerTitleWrap}>
          <Text style={styles.navTitle}>Chessboard</Text>
          <StatusCaption />
        </View>
        <PressableScale
          hitSlop={16}
          onPress={() => setFlipped(f => !f)}
          style={styles.flipBtn}>
          <Ionicons name="swap-vertical" size={23} color={theme.text} />
        </PressableScale>
      </View>

      {/* Drives the board off the selected ply, isolated from this tree. */}
      <HistorySync boardRef={ref} />

      <View style={styles.content}>
        {/* The cards + board centre in the space above the bottom group, so the
            slack splits evenly instead of pooling under the bottom card. */}
        <View style={styles.boardZone}>
          <View style={styles.topGroup}>
            {/* Top card = whoever's pieces sit at the top of the board, so it
              stays coherent when the board is flipped. */}
            <View style={styles.playerWrap}>
              <PlayerCard
                key={topSide}
                side={topSide}
                clock={CLOCKS[topSide]}
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

            {/* Bottom card = pieces at the bottom of the board. */}
            <View style={styles.playerWrap}>
              <PlayerCard
                key={bottomSide}
                side={bottomSide}
                clock={CLOCKS[bottomSide]}
              />
            </View>
          </View>
        </View>

        {/* Bottom group — move history sits directly above the actions. */}
        <View style={styles.bottomGroup}>
          {/* Move history — tap a move to inspect that position. */}
          <View style={styles.moveListWrap}>
            <MoveHistory />
          </View>

          {/* Actions — the primary Rematch button, with a compact "watch
              again" icon at the bottom-right. */}
          <View style={styles.actionRow}>
            <PressableScale
              onPress={confirmNewGame}
              style={[
                styles.actionButton,
                styles.actionSecondary,
                styles.actionFill,
              ]}>
              <Ionicons name="refresh" size={20} color={theme.text} />
              <Text style={styles.replayText}>New Game</Text>
            </PressableScale>
            <PressableScale onPress={playSequence} style={styles.iconButton}>
              <Ionicons name="play" size={22} color={theme.text} />
            </PressableScale>
          </View>
        </View>
      </View>
    </View>
  );
}

// A scoped jotai Provider gives every mount its own store, so the game state
// resets cleanly when re-entering the demo. The aura provider wraps the screen
// so `useCheckmateAura` resolves and the checkmate haze can snapshot the board.
export const ChessboardGame = () => (
  <Provider>
    <CheckmateAuraProvider>
      <GameScreen />
    </CheckmateAuraProvider>
  </Provider>
);

const HAIRLINE = StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  actionButton: {
    alignItems: 'center',
    borderCurve: 'continuous',
    borderRadius: 18,
    flexDirection: 'row',
    gap: 9,
    height: 52,
    justifyContent: 'center',
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
  boardHero: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  boardZone: {
    flex: 1,
    justifyContent: 'center',
  },
  bottomGroup: {
    gap: 10,
  },
  content: {
    flex: 1,
    paddingBottom: 28,
    paddingTop: 12,
  },
  flipBtn: {
    bottom: 8,
    padding: 4,
    position: 'absolute',
    right: GUTTER,
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
  iconButton: {
    alignItems: 'center',
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderCurve: 'continuous',
    borderRadius: 18,
    borderWidth: HAIRLINE,
    height: 52,
    justifyContent: 'center',
    width: 54,
  },
  moveListWrap: {
    paddingHorizontal: GUTTER,
    width: '100%',
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
  playerWrap: {
    paddingHorizontal: GUTTER,
    width: '100%',
  },
  replayText: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
  root: {
    backgroundColor: theme.bg,
    flex: 1,
  },
  topGroup: {
    alignItems: 'center',
    gap: 10,
  },
});

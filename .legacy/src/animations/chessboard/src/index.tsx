import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import React, { useState } from 'react';

import { Ionicons } from '@expo/vector-icons';
import { Provider } from 'jotai';
import { PressableScale } from 'pressto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CheckmateAuraProvider } from './checkmate-aura';
import { Board } from './components/board';
import { PlayPauseButton } from './components/play-pause-button';
import { PlayerCard } from './components/player-card';
import { StatusCaption } from './components/status-caption';
import { HistorySync } from './history-sync';
import { MoveHistory } from './move-history';
import { theme } from './theme';
import { useChessGame } from './use-chess-game';

import type { Side } from './types';

// Single horizontal gutter shared by the board and all chrome, so every
// left/right edge lines up.
const GUTTER = 16;

// Chrome (header + move history + action buttons) hidden for the demo
// recording — flip back to true to restore both sections.
const SHOW_CHROME = false;

// Pure layout — every behaviour (replay, pause, clocks, haptics, the
// checkmate aura) lives in useChessGame.
function GameScreen() {
  // setFlipped is only referenced by the commented-out flip control — restore
  // the destructured setter together with the button.
  const [flipped] = useState(false);
  const { width } = useWindowDimensions();
  const { top: safeTop } = useSafeAreaInsets();
  // Board spans the full screen width — the hero. Chrome is inset to GUTTER.
  const boardSize = width;
  const pieceSize = boardSize / 8;

  const { boardRef, boardBoxRef, onMove, togglePlay, confirmNewGame } =
    useChessGame({ flipped, pieceSize });

  // flipped=false shows white at the bottom (standard); flipped swaps it. Keep
  // the player cards on the same side as their pieces.
  const topSide: Side = flipped ? 'w' : 'b';
  const bottomSide: Side = flipped ? 'b' : 'w';

  return (
    <View style={styles.root}>
      {/* In-app header — title and live status caption. */}
      {SHOW_CHROME && (
        <View style={[styles.header, { paddingTop: safeTop + 6 }]}>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.navTitle}>Chessboard</Text>
            <StatusCaption />
          </View>
          {/* Board flip — hidden for the demo; re-enable by uncommenting.
          <PressableScale
            hitSlop={16}
            onPress={() => setFlipped(f => !f)}
            style={styles.flipBtn}>
            <Ionicons name="swap-vertical" size={23} color={theme.text} />
          </PressableScale>
          */}
        </View>
      )}

      {/* Drives the board off the selected ply, isolated from this tree. */}
      <HistorySync boardRef={boardRef} />

      <View style={styles.content}>
        {/* The cards + board centre in the space above the bottom group, so the
            slack splits evenly instead of pooling under the bottom card. */}
        <View style={styles.boardZone}>
          <View style={styles.topGroup}>
            {/* Top card = whoever's pieces sit at the top of the board, so it
              stays coherent when the board is flipped. */}
            <View style={styles.playerWrap}>
              <PlayerCard key={topSide} side={topSide} />
            </View>

            {/* Board */}
            <View style={styles.boardHero}>
              <Board
                chessRef={boardRef}
                boxRef={boardBoxRef}
                boardSize={boardSize}
                flipped={flipped}
                onMove={onMove}
              />
            </View>

            {/* Bottom card = pieces at the bottom of the board. */}
            <View style={styles.playerWrap}>
              <PlayerCard key={bottomSide} side={bottomSide} />
            </View>
          </View>
        </View>

        {/* Bottom group — move history sits directly above the actions. */}
        {SHOW_CHROME && (
          <View style={styles.bottomGroup}>
            {/* Move history — tap a move to inspect that position. */}
            <View style={styles.moveListWrap}>
              <MoveHistory />
            </View>

            {/* Actions — the primary New Game button, with the play/pause
              control at the bottom-right. */}
            <View style={styles.actionRow}>
              <PressableScale
                onPress={confirmNewGame}
                style={[
                  styles.actionButton,
                  styles.actionSecondary,
                  styles.actionFill,
                ]}>
                <Ionicons name="refresh" size={20} color={theme.text} />
                <Text style={styles.actionText}>New Game</Text>
              </PressableScale>
              <PlayPauseButton onPress={togglePlay} />
            </View>
          </View>
        )}
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
  actionText: {
    color: theme.text,
    fontFamily: 'SF-Pro-Rounded-Bold',
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 0.1,
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
  // Used by the commented-out flip control in the header.
  // eslint-disable-next-line react-native/no-unused-styles
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
  moveListWrap: {
    paddingHorizontal: GUTTER,
    width: '100%',
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
  root: {
    backgroundColor: theme.bg,
    flex: 1,
  },
  topGroup: {
    alignItems: 'center',
    gap: 10,
  },
});

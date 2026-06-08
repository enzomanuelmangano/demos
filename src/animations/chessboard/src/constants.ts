import { theme, withAlpha } from './theme';

import type { AnnotatedMove, Side } from './types';
import type { Square } from 'chess.js';
import type { ImageSourcePropType } from 'react-native';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PLAYERS: Record<Side, { name: string; rating: string }> = {
  b: { name: 'enzo', rating: '???' },
  w: { name: 'magnus', rating: '2841' },
};

// Starting clock time in seconds — both sides get 3:00.
export const CLOCK_START: Record<Side, number> = { w: 180, b: 180 };

// Mini piece images for the capture trays — the exact artwork the board draws,
// so captured pieces read in the board's visual language instead of thin
// font glyphs.
export const PIECE_IMG: Record<Side, Record<string, ImageSourcePropType>> = {
  w: {
    p: require('react-native-chessboard/src/assets/wp.png'),
    n: require('react-native-chessboard/src/assets/wn.png'),
    b: require('react-native-chessboard/src/assets/wb.png'),
    r: require('react-native-chessboard/src/assets/wr.png'),
    q: require('react-native-chessboard/src/assets/wq.png'),
    k: require('react-native-chessboard/src/assets/wk.png'),
  },
  b: {
    p: require('react-native-chessboard/src/assets/bp.png'),
    n: require('react-native-chessboard/src/assets/bn.png'),
    b: require('react-native-chessboard/src/assets/bb.png'),
    r: require('react-native-chessboard/src/assets/br.png'),
    q: require('react-native-chessboard/src/assets/bq.png'),
    k: require('react-native-chessboard/src/assets/bk.png'),
  },
};

export const VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };

// Board themed off the same OKLCH ramp as the UI: slate squares, accent-blue
// last-move, red mate — all in the shared hue family.
export const BOARD_COLORS = {
  white: theme.boardLight,
  black: theme.boardDark,
  lastMoveHighlight: withAlpha(theme.accent, 0.4),
  checkmateHighlight: theme.lose,
};

// Replay pacing + the choreography around checkmate, all in ms.
export const REPLAY = {
  // Pause on the start position before the first move plays.
  START_DELAY: 300,
  // Gap between a move's spring settling and the next move firing.
  MOVE_GAP: 260,
  // Poll cadence while the replay is held on pause.
  PAUSE_POLL: 120,
  // Mate → aura snapshot: past the move spring (~430ms) and the history
  // scroll settle, so makeImageFromView's inevitable main-thread frame cost
  // lands on a static screen where it can't be seen.
  AURA_DELAY: 580,
} as const;

// "Fool's Mate" — the fastest possible checkmate: White weakens the e1–h4
// diagonal with two pawn moves and Black's queen ends it on move two.
// chess.js-validated: f3 e5 g4 Qh4#.
export const FOOLS_MATE: [Square, Square][] = [
  ['f2', 'f3'], // 1. f3?
  ['e7', 'e5'], //    e5
  ['g2', 'g4'], // 2. g4??
  ['d8', 'h4'], //    Qh4#
];

// Canned post-game analysis (a real engine eval would produce these) — both
// of White's pawn moves are the famous self-destruction; Black just plays the
// punishment.
export const REVIEW_MOVES: AnnotatedMove[] = [
  { san: 'f3', quality: 'mistake' },
  { san: 'e5', quality: 'best' },
  { san: 'g4', quality: 'blunder' },
  { san: 'Qh4#', quality: 'brilliant' },
];

export const REVIEW_ACCURACY = { you: 11.2, opp: 100 };

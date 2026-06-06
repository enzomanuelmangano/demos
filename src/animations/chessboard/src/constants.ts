import { theme, withAlpha } from './theme';

import type { AnnotatedMove, Side } from './types';
import type { ImageSourcePropType } from 'react-native';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PLAYERS: Record<Side, { name: string; rating: number }> = {
  b: { name: 'magnus', rating: 2218 },
  w: { name: 'enzo', rating: 2190 },
};

export const CLOCKS: Record<Side, string> = { w: '3:09', b: '2:46' };

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

// "Fatal Attraction" — Edward Lasker vs George Alan Thomas, London 1912.
// 11.Qxh7+!! sacrifices the queen and Black's king is dragged the full length
// of the board (h7 → g1), mated in White's own camp by 18.Kd2#.
export const FATAL_ATTRACTION: Array<[string, string]> = [
  ['d2', 'd4'], // 1. d4
  ['e7', 'e6'], //    e6
  ['g1', 'f3'], // 2. Nf3
  ['f7', 'f5'], //    f5
  ['b1', 'c3'], // 3. Nc3
  ['g8', 'f6'], //    Nf6
  ['c1', 'g5'], // 4. Bg5
  ['f8', 'e7'], //    Be7
  ['g5', 'f6'], // 5. Bxf6
  ['e7', 'f6'], //    Bxf6
  ['e2', 'e4'], // 6. e4
  ['f5', 'e4'], //    fxe4
  ['c3', 'e4'], // 7. Nxe4
  ['b7', 'b6'], //    b6
  ['f3', 'e5'], // 8. Ne5
  ['e8', 'g8'], //    O-O
  ['f1', 'd3'], // 9. Bd3
  ['c8', 'b7'], //    Bb7
  ['d1', 'h5'], // 10. Qh5
  ['d8', 'e7'], //     Qe7??
  ['h5', 'h7'], // 11. Qxh7+!!
  ['g8', 'h7'], //     Kxh7
  ['e4', 'f6'], // 12. Nxf6+ (double check)
  ['h7', 'h6'], //     Kh6
  ['e5', 'g4'], // 13. Neg4+
  ['h6', 'g5'], //     Kg5
  ['h2', 'h4'], // 14. h4+
  ['g5', 'f4'], //     Kf4
  ['g2', 'g3'], // 15. g3+
  ['f4', 'f3'], //     Kf3
  ['d3', 'e2'], // 16. Be2+
  ['f3', 'g2'], //     Kg2
  ['h1', 'h2'], // 17. Rh2+
  ['g2', 'g1'], //     Kg1
  ['e1', 'd2'], // 18. Kd2#
];

// Canned post-game analysis (a real engine eval would produce these) — White's
// queen sacrifice and the forced king hunt rate as the highlights; Black's
// 10...Qe7?? is the losing blunder.
export const REVIEW_MOVES: AnnotatedMove[] = [
  { san: 'd4', quality: 'book' },
  { san: 'e6', quality: 'book' },
  { san: 'Nf3', quality: 'book' },
  { san: 'f5', quality: 'book' },
  { san: 'Nc3', quality: 'book' },
  { san: 'Nf6', quality: 'book' },
  { san: 'Bg5', quality: 'book' },
  { san: 'Be7', quality: 'book' },
  { san: 'Bxf6', quality: 'good' },
  { san: 'Bxf6', quality: 'good' },
  { san: 'e4', quality: 'best' },
  { san: 'fxe4', quality: 'good' },
  { san: 'Nxe4', quality: 'best' },
  { san: 'b6', quality: 'inaccuracy' },
  { san: 'Ne5', quality: 'great' },
  { san: 'O-O', quality: 'mistake' },
  { san: 'Bd3', quality: 'best' },
  { san: 'Bb7', quality: 'inaccuracy' },
  { san: 'Qh5', quality: 'great' },
  { san: 'Qe7', quality: 'blunder' },
  { san: 'Qxh7+', quality: 'brilliant' },
  { san: 'Kxh7', quality: 'good' },
  { san: 'Nxf6+', quality: 'best' },
  { san: 'Kh6', quality: 'good' },
  { san: 'Neg4+', quality: 'best' },
  { san: 'Kg5', quality: 'good' },
  { san: 'h4+', quality: 'best' },
  { san: 'Kf4', quality: 'good' },
  { san: 'g3+', quality: 'best' },
  { san: 'Kf3', quality: 'good' },
  { san: 'Be2+', quality: 'best' },
  { san: 'Kg2', quality: 'good' },
  { san: 'Rh2+', quality: 'best' },
  { san: 'Kg1', quality: 'good' },
  { san: 'Kd2#', quality: 'great' },
];

export const REVIEW_ACCURACY = { you: 98.6, opp: 41.3 };

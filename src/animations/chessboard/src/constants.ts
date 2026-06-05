import { theme, withAlpha } from './theme';

import type { AnnotatedMove, Side } from './types';

export const START_FEN =
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PLAYERS: Record<Side, { name: string; rating: number }> = {
  b: { name: 'nimzoknight', rating: 2218 },
  w: { name: 'you', rating: 2190 },
};

export const CLOCKS: Record<Side, string> = { w: '3:09', b: '2:46' };

// Solid glyphs per colour, indexed by piece type — used in capture trays.
export const GLYPH: Record<Side, Record<string, string>> = {
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' },
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' },
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

export const FOOLS_MATE: Array<[string, string]> = [
  ['f2', 'f3'],
  ['e7', 'e5'],
  ['g2', 'g4'],
  ['d8', 'h4'],
];

// Canned post-game analysis for Fool's Mate (a real engine eval would produce
// these). 1. f3 (weakens the king) e5  2. g4?? (allows mate) Qh4#.
export const REVIEW_MOVES: AnnotatedMove[] = [
  { san: 'f3', quality: 'inaccuracy' },
  { san: 'e5', quality: 'best' },
  { san: 'g4', quality: 'blunder' },
  { san: 'Qh4#', quality: 'brilliant' },
];

export const REVIEW_ACCURACY = { you: 24.5, opp: 98.6 };

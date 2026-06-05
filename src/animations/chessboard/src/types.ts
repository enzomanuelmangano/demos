// Shared types for the chessboard demo.

// Piece / player colour. White or black — used for sides, pieces and turns.
export type Side = 'w' | 'b';

// Move-quality classification for the post-game recap (chess.com style).
export type Quality =
  | 'brilliant'
  | 'great'
  | 'book'
  | 'best'
  | 'excellent'
  | 'good'
  | 'inaccuracy'
  | 'mistake'
  | 'miss'
  | 'blunder';

export type AnnotatedMove = { san: string; quality: Quality };

// Payload to raise the checkmate aura + game-review card.
export type ShowOpts = {
  x: number; // king window-x
  y: number; // king window-y
  subtitle: string; // "<winner> wins"
  oppName: string;
  accuracy: { you: number; opp: number };
  moves: AnnotatedMove[];
  onRematch: () => void;
  onReview: () => void;
};

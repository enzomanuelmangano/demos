import React, { useLayoutEffect, useRef } from 'react';

import { useAtomValue } from 'jotai';

import { START_FEN } from './constants';
import { pliesAtom, runningAtom, selectedPlyAtom } from './state';

import type { Square } from 'chess.js';
import type { ChessboardRef } from 'react-native-chessboard';

// Drives the board ref off the selected ply, in isolation: it's the only thing
// (besides the replay) that subscribes to the selection, so scrubbing the
// history never re-renders the board, the player cards or the aura tree.
export const HistorySync: React.FC<{
  boardRef: React.RefObject<ChessboardRef | null>;
}> = ({ boardRef }) => {
  const selectedPly = useAtomValue(selectedPlyAtom);
  const plies = useAtomValue(pliesAtom);
  const running = useAtomValue(runningAtom);
  const prevPly = useRef(selectedPly);
  const prevLen = useRef(plies.length);
  // Layout effect (not passive) so the board is driven before paint — one frame
  // snappier on tap.
  useLayoutEffect(() => {
    const from = prevPly.current;
    const to = selectedPly;
    const grew = plies.length > prevLen.current;
    prevPly.current = to;
    prevLen.current = plies.length;
    if (running) return; // the replay owns the board while it plays
    // A newly-played move (drag or programmatic) already moved the board via
    // its own animation and just advanced the selection — don't re-drive it.
    if (grew) return;
    if (to === from) return;

    // Highlight the move that produced the target position (canonical review
    // highlight), regardless of which way we stepped.
    const lastMove =
      to >= 0
        ? { from: plies[to].from as Square, to: plies[to].to as Square }
        : null;

    // Slide the piece that physically changed squares between the two
    // positions — forward plays the target move, backward reverses the move
    // we're leaving. Only single-ply steps animate; bigger jumps snap.
    let slide: { from: Square; to: Square } | undefined;
    if (to === from + 1 && to >= 0) {
      slide = { from: plies[to].from as Square, to: plies[to].to as Square };
    } else if (to === from - 1 && from >= 0) {
      slide = {
        from: plies[from].to as Square,
        to: plies[from].from as Square,
      };
    }

    boardRef.current?.resetBoard(to < 0 ? START_FEN : plies[to].fen, {
      slide,
      lastMove,
    });
  }, [selectedPly, plies, running, boardRef]);
  return null;
};

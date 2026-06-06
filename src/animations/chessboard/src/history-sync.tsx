import React, { useEffect, useRef } from 'react';

import { useStore } from 'jotai';

import { START_FEN } from './constants';
import { pliesAtom, runningAtom, selectedPlyAtom } from './state';

import type { Square } from 'chess.js';
import type { ChessboardRef } from 'react-native-chessboard';

// Drives the board ref off the selected ply, in isolation. The subscription is
// imperative (store.sub) — the component renders exactly once and never again;
// selection changes drive the board synchronously from the store callback, so
// scrubbing costs zero React renders.
export const HistorySync: React.FC<{
  boardRef: React.RefObject<ChessboardRef | null>;
}> = ({ boardRef }) => {
  const store = useStore();
  const prevPly = useRef<number | null>(null);
  const prevLen = useRef<number | null>(null);

  useEffect(() => {
    prevPly.current = store.get(selectedPlyAtom);
    prevLen.current = store.get(pliesAtom).length;

    const onSelection = () => {
      const to = store.get(selectedPlyAtom);
      const plies = store.get(pliesAtom);
      const from = prevPly.current ?? -1;
      const grew = plies.length > (prevLen.current ?? 0);
      prevPly.current = to;
      prevLen.current = plies.length;

      if (store.get(runningAtom)) return; // the replay owns the board
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
    };

    return store.sub(selectedPlyAtom, onSelection);
  }, [store, boardRef]);

  return null;
};

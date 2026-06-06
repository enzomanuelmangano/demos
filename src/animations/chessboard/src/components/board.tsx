import { View } from 'react-native';

import React, { memo } from 'react';

import Chessboard from 'react-native-chessboard';

import { BOARD_COLORS } from '../constants';

import type { ChessboardRef, MoveResult } from 'react-native-chessboard';

// The board is isolated behind React.memo so the chrome's per-move state
// updates (status / moves / captured) never reconcile the Chessboard
// subtree. Its props are all stable — it re-renders only on flip / resize.
export const Board = memo(function Board({
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

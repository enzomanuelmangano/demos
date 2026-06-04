import { LayoutRectangle } from 'react-native';

import { atom } from 'jotai';
import { atomFamily } from 'jotai/utils';

// One ply of the game — enough to render the history, jump the board to the
// resulting position, and animate the moving piece in either direction.
export type Ply = {
  san: string;
  fen: string;
  from: string;
  to: string;
};

// Source of truth for the played game.
export const pliesAtom = atom<Ply[]>([]);
// Currently-inspected ply: -1 = start position, i = position after move i.
export const selectedPlyAtom = atom(-1);
// True while the canned replay is auto-playing — history navigation is locked
// and the board is driven by the replay, not by the selection.
export const runningAtom = atom(false);
// Captured pieces per side + live status caption (drive the player cards).
export const capturedAtom = atom<{ w: string[]; b: string[] }>({
  w: [],
  b: [],
});
export const statusAtom = atom('White to move');

// Derived: just the SAN strings, for the move-history strip.
export const movesAtom = atom(get => get(pliesAtom).map(p => p.san));

// Per-ply "am I selected?" — a move token subscribes only to its own slice, so
// changing the selection re-renders just the two toggling tokens (not the list).
// eslint-disable-next-line deprecation/deprecation -- atomFamily is stable in jotai 2.x
export const isPlySelectedFamily = atomFamily((ply: number) =>
  atom(get => get(selectedPlyAtom) === ply),
);

// Per-ply measured frame, written on layout — the highlight pill reads only the
// frame of the currently-selected ply.
// eslint-disable-next-line deprecation/deprecation -- atomFamily is stable in jotai 2.x
export const plyFrameFamily = atomFamily((_ply: number) =>
  atom<LayoutRectangle | null>(null),
);

// True once the user has tapped a move — the highlight pill stays hidden until
// then (it only appears as a result of interaction, not the auto-replay).
export const interactedAtom = atom(false);

// Write-only selection action: clamps + ignores taps during the replay, so
// tokens don't need to subscribe to plies/running just to dispatch a tap.
export const selectMoveAtom = atom(null, (get, set, ply: number) => {
  if (get(runningAtom)) return;
  set(interactedAtom, true);
  const len = get(pliesAtom).length;
  set(selectedPlyAtom, Math.max(-1, Math.min(ply, len - 1)));
});

// Reset the whole game back to the starting position.
export const resetGameAtom = atom(null, (_get, set) => {
  set(pliesAtom, []);
  set(selectedPlyAtom, -1);
  set(capturedAtom, { w: [], b: [] });
  set(statusAtom, 'White to move');
  set(interactedAtom, false);
});

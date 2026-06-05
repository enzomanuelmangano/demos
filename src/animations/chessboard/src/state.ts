import { LayoutRectangle } from 'react-native';

import { atom } from 'jotai';

import type { Atom, PrimitiveAtom } from 'jotai';

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

// Per-ply atom factories. A plain Map cache keyed by ply gives each ply its own
// stable atom (created once, reused across renders) — same role as jotai's
// atomFamily, but without the deprecated `jotai/utils` import.
const memoizePerPly = <T>(create: (ply: number) => T): ((ply: number) => T) => {
  const cache = new Map<number, T>();
  return (ply: number) => {
    let entry = cache.get(ply);
    if (!entry) {
      entry = create(ply);
      cache.set(ply, entry);
    }
    return entry;
  };
};

// Per-ply "am I selected?" — a move token subscribes only to its own slice, so
// changing the selection re-renders just the two toggling tokens (not the list).
export const isPlySelectedFamily = memoizePerPly(
  (ply: number): Atom<boolean> => atom(get => get(selectedPlyAtom) === ply),
);

// Per-ply measured frame, written on layout — the highlight pill reads only the
// frame of the currently-selected ply.
export const plyFrameFamily = memoizePerPly(
  (_ply: number): PrimitiveAtom<LayoutRectangle | null> =>
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

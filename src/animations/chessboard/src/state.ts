import { LayoutRectangle } from 'react-native';

import { atom } from 'jotai';
import { makeMutable } from 'react-native-reanimated';

import { CLOCK_START } from './constants';

import type { Side } from './types';
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
// True while a running replay is held at the current position (play/pause).
export const pausedAtom = atom(false);
// Captured pieces per side + live status caption (drive the player cards).
export const capturedAtom = atom<{ w: string[]; b: string[] }>({
  w: [],
  b: [],
});
export const statusAtom = atom('White to move');

// UI-thread mirrors of the hot per-move state. The move handler writes these
// alongside the atoms; animated styles read them directly, so the player-card
// turn treatment updates with ZERO React re-renders during the replay.
export const turnSv = makeMutable<Side>('w');
export const gameOverSv = makeMutable(false);

// Derived: the winner once (and only once) the game ends in mate — `null` the
// whole game, so subscribers (the WON/LOST tags) render exactly once, at the
// end, instead of on every status flip.
export const gameResultAtom = atom<Side | null>(get => {
  if (get(statusAtom) !== 'Checkmate') return null;
  // Odd ply count ⇒ white delivered the mating move.
  return get(pliesAtom).length % 2 === 1 ? 'w' : 'b';
});

// Derived: just the SAN strings, for the move-history strip.
export const movesAtom = atom(get => get(pliesAtom).map(p => p.san));

// Chess clocks, in remaining seconds per side, as shared values: the ticking
// second writes the SV and the clock readouts are ReTexts deriving from it —
// time burns with zero React re-renders.
export const clockSv: Record<Side, ReturnType<typeof makeMutable<number>>> = {
  w: makeMutable(CLOCK_START.w),
  b: makeMutable(CLOCK_START.b),
};
// True once the first move of a game lands — clocks only burn in a live game.
export const startedSv = makeMutable(false);

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
  turnSv.set('w');
  gameOverSv.set(false);
  startedSv.set(false);
  clockSv.w.set(CLOCK_START.w);
  clockSv.b.set(CLOCK_START.b);
});

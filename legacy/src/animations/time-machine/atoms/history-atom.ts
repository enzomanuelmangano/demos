import { atom } from 'jotai';

import { generateKey } from '../constants';

export type HistoryItem = {
  items: number[];
  key: string;
};

// Every reorder adds an entry; keep only the most recent ones.
export const MAX_HISTORY_LENGTH = 10;

const InitialKey = generateKey();

export const ActiveItemKeyAtom = atom<string>(InitialKey);

export const HistoryAtom = atom<HistoryItem[]>([
  {
    items: [1, 2, 3, 4],
    key: InitialKey,
  },
]);

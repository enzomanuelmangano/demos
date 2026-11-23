import { atom, useAtomValue, useSetAtom } from 'jotai';

import {
  EMPTY_ANALYSIS,
  type AnalysisResult,
} from './hooks/use-painting-analysis';

// Selected painting ID (null = atlas mode)
export const selectedPaintingIdAtom = atom<string | null>(null);

// Analysis result from painting
export const analysisAtom = atom<AnalysisResult>(EMPTY_ANALYSIS);

// Derived atom: is in atlas mode
export const isAtlasModeAtom = atom(
  get => get(selectedPaintingIdAtom) === null,
);

// Hooks for consuming atoms
export const useSelectedPaintingId = () => useAtomValue(selectedPaintingIdAtom);
export const useSetSelectedPaintingId = () =>
  useSetAtom(selectedPaintingIdAtom);

export const useAnalysis = () => useAtomValue(analysisAtom);
export const useSetAnalysis = () => useSetAtom(analysisAtom);

export const useIsAtlasMode = () => useAtomValue(isAtlasModeAtom);

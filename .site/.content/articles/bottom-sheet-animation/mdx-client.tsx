'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const InteractiveBox = dynamic(
  () => import('@/components/interactive').then((m) => m.InteractiveBox),
  { ssr: false }
);

export const InitialSetup = dynamic(
  () => import('./components/bottom-sheet').then((m) => m.InitialSetup),
  { ssr: false }
);

export const BasicComponent = dynamic(
  () => import('./components/bottom-sheet').then((m) => m.BasicComponent),
  { ssr: false }
);

export const PanGesture = dynamic(
  () => import('./components/bottom-sheet').then((m) => m.PanGesture),
  { ssr: false }
);

export const BorderRadius = dynamic(
  () => import('./components/bottom-sheet').then((m) => m.BorderRadius),
  { ssr: false }
);

export const FinalDemo = dynamic(
  () => import('./components/bottom-sheet').then((m) => m.FinalDemo),
  { ssr: false }
);

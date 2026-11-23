'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const InteractivePanGesture = dynamic(
  () => import('./components').then((m) => m.InteractivePanGesture),
  { ssr: false }
);

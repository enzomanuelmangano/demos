'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const IntroToGesturesDemo = dynamic(
  () => import('./components/intro-to-gestures').then((m) => m.IntroToGesturesDemo),
  { ssr: false }
);

'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const AnimatedSquare = dynamic(
  () => import('./components/animated-square').then((m) => m.AnimatedSquare),
  { ssr: false }
);

export const InteractiveBox = dynamic(
  () => import('@/components/interactive').then((m) => m.InteractiveBox),
  { ssr: false }
);

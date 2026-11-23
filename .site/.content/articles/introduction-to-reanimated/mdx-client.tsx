'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const FinalAnimatedSquareDemo = dynamic(
  () => import('./components/animated-square').then((m) => m.FinalAnimatedSquareDemo),
  { ssr: false }
);

export const AnimatedSquareOpacityDemo = dynamic(
  () => import('./components/animated-square').then((m) => m.AnimatedSquareOpacityDemo),
  { ssr: false }
);

export const AnimatedSquareOpacityAndScaleDemo = dynamic(
  () => import('./components/animated-square').then((m) => m.AnimatedSquareOpacityAndScaleDemo),
  { ssr: false }
);

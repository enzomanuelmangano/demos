'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const AnimatedSpiralWithSkia = dynamic(
  () => import('./components/skia-spiral').then((m) => m.AnimatedSpiralWithSkia),
  { ssr: false }
);

export const AnimatedInteractiveSnappySpiralWhite = dynamic(
  () => import('./components/skia-spiral').then((m) => m.AnimatedInteractiveSnappySpiralWhite),
  { ssr: false }
);

export const AnimatedInteractiveSnappySpiralGradient = dynamic(
  () => import('./components/skia-spiral').then((m) => m.AnimatedInteractiveSnappySpiralGradient),
  { ssr: false }
);

export const AnimatedInteractiveAnimatedSpiralFixedRadiusGradient = dynamic(
  () => import('./components/skia-spiral').then((m) => m.AnimatedInteractiveAnimatedSpiralFixedRadiusGradient),
  { ssr: false }
);

export const InlineMath = dynamic(
  () => import('@/components/lazy-math-components').then((m) => m.InlineMath),
  { ssr: false }
);

export const BlockMath = dynamic(
  () => import('@/components/lazy-math-components').then((m) => m.BlockMath),
  { ssr: false }
);

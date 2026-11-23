'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const AnimatedGradientWithSkia = dynamic(
  () => import('./components/skia-gradient').then((m) => m.AnimatedGradientWithSkia),
  { ssr: false }
);

export const GlitchedAnimatedGradientWithSkia = dynamic(
  () => import('./components/skia-gradient').then((m) => m.GlitchedAnimatedGradientWithSkia),
  { ssr: false }
);

export const NonInteractiveAnimatedGradientWithSkia = dynamic(
  () => import('./components/skia-gradient').then((m) => m.NonInteractiveAnimatedGradientWithSkia),
  { ssr: false }
);

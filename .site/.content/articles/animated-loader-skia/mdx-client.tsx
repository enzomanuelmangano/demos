'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const BasicLoaderWithSkia = dynamic(
  () => import('./components').then((m) => m.BasicLoaderWithSkia),
  { ssr: false }
);

export const WithGradientLoaderWithSkia = dynamic(
  () => import('./components').then((m) => m.WithGradientLoaderWithSkia),
  { ssr: false }
);

export const WithProgressLoaderWithSkia = dynamic(
  () => import('./components').then((m) => m.WithProgressLoaderWithSkia),
  { ssr: false }
);

export const WithBasicAnimationLoaderWithSkia = dynamic(
  () => import('./components').then((m) => m.WithBasicAnimationLoaderWithSkia),
  { ssr: false }
);

export const WithAnimationLoaderWithSkia = dynamic(
  () => import('./components').then((m) => m.WithAnimationLoaderWithSkia),
  { ssr: false }
);

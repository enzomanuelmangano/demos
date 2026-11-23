'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const BasicMetaballWithSkia = dynamic(
  () => import('./components').then((m) => m.BasicMetaballWithSkia),
  { ssr: false }
);

export const WithPanMetaballWithSkia = dynamic(
  () => import('./components').then((m) => m.WithPanMetaballWithSkia),
  { ssr: false }
);

export const WithColorMatrixMetaballWithSkia = dynamic(
  () => import('./components').then((m) => m.WithColorMatrixMetaballWithSkia),
  { ssr: false }
);

export const WithBlurMetaballWithSkia = dynamic(
  () => import('./components').then((m) => m.WithBlurMetaballWithSkia),
  { ssr: false }
);

export const CanvasKitJsAlert = dynamic(
  () => import('@/components/ui/alert').then((m) => m.CanvasKitJsAlert),
  { ssr: false }
);

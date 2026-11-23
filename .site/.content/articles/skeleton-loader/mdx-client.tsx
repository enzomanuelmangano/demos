'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const InteractiveSkeletonDemo = dynamic(
  () => import('./components/interactive').then((m) => m.InteractiveSkeletonDemo),
  { ssr: false }
);

export const InteractiveContactItem = dynamic(
  () => import('./components/interactive').then((m) => m.InteractiveContactItem),
  { ssr: false }
);

export const InteractiveJustSkeleton = dynamic(
  () => import('./components/interactive').then((m) => m.InteractiveJustSkeleton),
  { ssr: false }
);

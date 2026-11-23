'use client';

// GENERATO da scripts/build-article-client-wrappers.ts — non modificare a mano.
import dynamic from 'next/dynamic';

export const Demo = dynamic(
  () => import('./components').then((m) => m.Demo),
  { ssr: false }
);

export const StaticDemo = dynamic(
  () => import('./components').then((m) => m.StaticDemo),
  { ssr: false }
);

'use client';

import { forwardRef } from 'react';

import { Metaball } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const WithColorMatrixMetaball = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => <Metaball type="with-color-matrix" ref={ref} />
);

export function InteractiveWithColorMatrixMetaball() {
  return (
    <InteractiveBox
      children={WithColorMatrixMetaball}
      theme="light"
      withReset
      style={{
        aspectRatio: 1,
      }}
    />
  );
}
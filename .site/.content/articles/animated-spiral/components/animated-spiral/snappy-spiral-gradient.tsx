'use client';

import { forwardRef } from 'react';

import { Spiral } from './spiral';

import {
  InteractiveForwardRefProps,
  InteractiveBox,
} from '@/components/interactive';

const SnappySpiralGradient = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => (
    <Spiral
      ref={ref}
      withAnimation={false}
      withSweepGradient={true}
      withFixedRadius={true}
    />
  )
);

export const InteractiveSnappySpiralGradient = () => {
  return (
    <InteractiveBox
      children={SnappySpiralGradient}
      withPlay
      withReset
      theme="light"
    />
  );
};
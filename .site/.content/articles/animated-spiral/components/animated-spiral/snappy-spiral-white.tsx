'use client';

import { forwardRef } from 'react';

import { Spiral } from './spiral';

import {
  InteractiveForwardRefProps,
  InteractiveBox,
} from '@/components/interactive';

const SnappySpiralWhite = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Spiral
    ref={ref}
    withAnimation={false}
    withSweepGradient={false}
    withFixedRadius={true}
  />
));

export const InteractiveSnappySpiralWhite = () => {
  return (
    <InteractiveBox
      children={SnappySpiralWhite}
      withPlay
      withReset
      theme="light"
    />
  );
};
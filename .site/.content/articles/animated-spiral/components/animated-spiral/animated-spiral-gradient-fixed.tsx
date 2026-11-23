'use client';

import { forwardRef } from 'react';

import { Spiral } from './spiral';

import {
  InteractiveForwardRefProps,
  InteractiveBox,
} from '@/components/interactive';

const AnimatedSpiralGradient = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => (
    <Spiral ref={ref} withAnimation withSweepGradient withFixedRadius />
  )
);

export const InteractiveAnimatedSpiralFixedRadiusGradient = () => {
  return (
    <InteractiveBox
      children={AnimatedSpiralGradient}
      withPlay
      withReset
      theme="light"
    />
  );
};
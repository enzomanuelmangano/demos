'use client';

import { AnimatedGradient } from './base';

import { InteractiveBox } from '@/components/interactive';

export const NonInteractiveAnimatedGradient = () => {
  return (
    <InteractiveBox children={AnimatedGradient} withPlay={false} theme="dark" />
  );
};
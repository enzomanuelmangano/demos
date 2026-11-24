'use client';

import { AnimatedGradient } from './base';

import { InteractiveBox } from '@/components/interactive';

type InteractiveAnimatedGradientProps = {
  withPlay?: boolean;
};

export const InteractiveAnimatedGradient = ({
  withPlay = true,
}: InteractiveAnimatedGradientProps) => {
  return (
    <InteractiveBox
      children={AnimatedGradient}
      withPlay={withPlay}
      theme="dark"
    />
  );
};
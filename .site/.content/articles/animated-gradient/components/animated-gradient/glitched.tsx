'use client';

import { forwardRef } from 'react';

import { AnimatedGradient } from './base';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const GlitchedAnimatedGradient = forwardRef<InteractiveForwardRefProps>(
  (_, ref) => <AnimatedGradient animated={false} ref={ref} />
);

export const GlitchedAnimatedGradientWithSkia = () => {
  return (
    <InteractiveBox children={GlitchedAnimatedGradient} withPlay theme="dark" />
  );
};
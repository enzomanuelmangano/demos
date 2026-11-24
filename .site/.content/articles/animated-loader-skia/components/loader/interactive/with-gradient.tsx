'use client';

import { forwardRef } from 'react';

import { Loader } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const GradientLoader = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Loader type="with-gradient" ref={ref} />
));

export function InteractiveGradientLoader() {
  return <InteractiveBox children={GradientLoader} theme="light" />;
}
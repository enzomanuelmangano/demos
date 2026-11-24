'use client';

import { forwardRef } from 'react';

import { Loader } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const AnimatedLoader = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Loader type="with-animation" ref={ref} />
));

export function InteractiveAnimatedLoader() {
  return (
    <InteractiveBox
      children={AnimatedLoader}
      theme="light"
      withPlay
      withReset
    />
  );
}
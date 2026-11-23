'use client';

import { forwardRef, memo } from 'react';

import { Loader } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const BasicAnimatedLoader = memo(
  forwardRef<InteractiveForwardRefProps>((_, ref) => (
    <Loader type="with-basic-animation" ref={ref} />
  ))
);

export function InteractiveBasicAnimatedLoader() {
  return (
    <InteractiveBox
      children={BasicAnimatedLoader}
      theme="light"
      withPlay
      withReset
    />
  );
}
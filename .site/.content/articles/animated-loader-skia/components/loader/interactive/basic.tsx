'use client';

import { forwardRef } from 'react';

import { Loader } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const BasicLoader = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Loader type="basic" ref={ref} />
));

export function InteractiveBasicLoader() {
  return <InteractiveBox children={BasicLoader} theme="light" />;
}
'use client';

import { forwardRef } from 'react';

import { Metaball } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const WithBlurMetaball = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Metaball type="with-blur" ref={ref} />
));

export function InteractiveWithBlurMetaball() {
  return <InteractiveBox children={WithBlurMetaball} theme="light" />;
}
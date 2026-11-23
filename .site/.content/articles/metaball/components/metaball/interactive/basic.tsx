'use client';

import { forwardRef } from 'react';

import { Metaball } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const BasicMetaball = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Metaball type="basic" ref={ref} />
));

export function InteractiveBasicMetaball() {
  return <InteractiveBox children={BasicMetaball} theme="light" />;
}
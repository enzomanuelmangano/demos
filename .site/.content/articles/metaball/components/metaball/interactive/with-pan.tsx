'use client';

import { forwardRef } from 'react';

import { Metaball } from '../component';

import {
  InteractiveBox,
  InteractiveForwardRefProps,
} from '@/components/interactive';

const WithPanMetaball = forwardRef<InteractiveForwardRefProps>((_, ref) => (
  <Metaball type="with-pan" ref={ref} />
));

export function InteractiveWithPanMetaball() {
  return <InteractiveBox children={WithPanMetaball} theme="light" />;
}
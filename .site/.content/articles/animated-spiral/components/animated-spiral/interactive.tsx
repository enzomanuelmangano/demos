'use client';

import { Spiral } from './spiral';

import { InteractiveBox } from '@/components/interactive';

export const InteractiveSpiral = () => {
  return <InteractiveBox children={Spiral} withPlay withReset theme="light" />;
};
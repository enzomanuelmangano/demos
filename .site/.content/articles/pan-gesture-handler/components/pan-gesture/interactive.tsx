'use client';

import { PanGestureDemo } from './base';

import { InteractiveBox } from '@/components/interactive';

export const InteractivePanGesture = () => {
  return <InteractiveBox children={PanGestureDemo} withPlay theme="light" />;
};
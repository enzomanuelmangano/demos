'use client';

import { InteractiveBasicLoader } from './loader/interactive/basic';
import { InteractiveAnimatedLoader } from './loader/interactive/with-animation';
import { InteractiveBasicAnimatedLoader } from './loader/interactive/with-basic-animation';
import { InteractiveGradientLoader } from './loader/interactive/with-gradient';
import { InteractiveProgressLoader } from './loader/interactive/with-progress';

export const BasicLoaderWithSkia = () => {
  return <InteractiveBasicLoader />;
};

export const WithGradientLoaderWithSkia = () => {
  return <InteractiveGradientLoader />;
};

export const WithProgressLoaderWithSkia = () => {
  return <InteractiveProgressLoader />;
};

export const WithBasicAnimationLoaderWithSkia = () => {
  return <InteractiveBasicAnimatedLoader />;
};

export const WithAnimationLoaderWithSkia = () => {
  return <InteractiveAnimatedLoader />;
};
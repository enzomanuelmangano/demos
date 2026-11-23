'use client';

import { InteractiveAnimatedGradient } from './animated-gradient/completed';
import { NonInteractiveAnimatedGradient } from './animated-gradient/non-interactive';
import { GlitchedAnimatedGradientWithSkia as GlitchedAnimatedGradient } from './animated-gradient/glitched';

export const AnimatedGradientWithSkia = () => {
  return <InteractiveAnimatedGradient />;
};

export const NonInteractiveAnimatedGradientWithSkia = () => {
  return <NonInteractiveAnimatedGradient />;
};

export const GlitchedAnimatedGradientWithSkia = () => {
  return <GlitchedAnimatedGradient />;
};
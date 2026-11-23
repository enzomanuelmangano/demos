'use client';

import { InteractiveSpiral } from './animated-spiral/interactive';
import { InteractiveSnappySpiralWhite } from './animated-spiral/snappy-spiral-white';
import { InteractiveSnappySpiralGradient } from './animated-spiral/snappy-spiral-gradient';
import { InteractiveAnimatedSpiralFixedRadiusGradient } from './animated-spiral/animated-spiral-gradient-fixed';

export const AnimatedSpiralWithSkia = () => {
  return <InteractiveSpiral />;
};

export const AnimatedInteractiveSnappySpiralWhite = () => {
  return <InteractiveSnappySpiralWhite />;
};

export const AnimatedInteractiveSnappySpiralGradient = () => {
  return <InteractiveSnappySpiralGradient />;
};

export const AnimatedInteractiveAnimatedSpiralFixedRadiusGradient = () => {
  return <InteractiveAnimatedSpiralFixedRadiusGradient />;
};
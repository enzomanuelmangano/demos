'use client';

import { InteractiveBasicMetaball } from './metaball/interactive/basic';
import { InteractiveWithBlurMetaball } from './metaball/interactive/with-blur';
import { InteractiveWithColorMatrixMetaball } from './metaball/interactive/with-color-matrix';
import { InteractiveWithPanMetaball } from './metaball/interactive/with-pan';

export const BasicMetaballWithSkia = () => {
  return <InteractiveBasicMetaball />;
};

export const WithPanMetaballWithSkia = () => {
  return <InteractiveWithPanMetaball />;
};

export const WithColorMatrixMetaballWithSkia = () => {
  return <InteractiveWithColorMatrixMetaball />;
};

export const WithBlurMetaballWithSkia = () => {
  return <InteractiveWithBlurMetaball />;
};
import { useContext } from 'react';

import { GLTransitionsContext } from './provider';

export const useGLTransition = () => {
  // Very simple hook that returns the GLTransitionsContext
  return useContext(GLTransitionsContext);
};

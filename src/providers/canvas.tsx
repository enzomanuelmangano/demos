import type { PropsWithChildren } from 'react';
import React, { createContext, useContext } from 'react';

type SizeContextType = {
  size: { width: number; height: number };
};

const SizeContext = createContext<SizeContextType>({
  size: { width: 0, height: 0 },
});

const SizeProvider: React.FC<PropsWithChildren<SizeContextType>> = ({
  size,
  children,
}) => {
  return (
    <SizeContext.Provider value={{ size }}>{children}</SizeContext.Provider>
  );
};

// TODO: Add docs
const useDeprecatedCanvas = () => {
  return useContext(SizeContext);
};

export { SizeProvider, useDeprecatedCanvas };

import React, {
  createContext,
  use,
  useMemo,
  type PropsWithChildren,
} from 'react';
import {
  Header as DefaultHeader,
  Backdrop as DefaultBackdrop,
} from '../components/defaults';

export type RetrayComponents = {
  Header: React.ComponentType;
  Backdrop: React.ComponentType;
};

// Default components configuration
export const defaultComponents: RetrayComponents = {
  Header: DefaultHeader,
  Backdrop: DefaultBackdrop,
};

export const RetrayComponentsContext =
  createContext<RetrayComponents>(defaultComponents);

interface RetrayComponentsProviderProps extends PropsWithChildren {
  Header?: React.ComponentType;
  Backdrop?: React.ComponentType;
}

export const RetrayComponentsProvider: React.FC<
  RetrayComponentsProviderProps
> = ({ children, Header, Backdrop }) => {
  const components: RetrayComponents = useMemo(
    () => ({
      Header: Header || defaultComponents.Header,
      Backdrop: Backdrop || defaultComponents.Backdrop,
    }),
    [Header, Backdrop]
  );

  return (
    <RetrayComponentsContext.Provider value={components}>
      {children}
    </RetrayComponentsContext.Provider>
  );
};

export const useRetrayComponents = () => {
  return use(RetrayComponentsContext);
};

import React, { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { makeMutable, useSharedValue } from 'react-native-reanimated';

type ActiveTabBarContextType = {
  isActive: SharedValue<boolean>;
};

const ActiveTabBarContext = React.createContext<ActiveTabBarContextType>({
  isActive: makeMutable(true),
});

type ActiveTabBarContextProviderProps = {
  children?: React.ReactNode;
};

const ActiveTabBarContextProvider: React.FC<
  ActiveTabBarContextProviderProps
> = ({ children }) => {
  const isActive = useSharedValue(true);

  const value = useMemo(() => {
    return {
      isActive,
    };
  }, []);

  return (
    <ActiveTabBarContext.Provider value={value}>
      {children}
    </ActiveTabBarContext.Provider>
  );
};

const useActiveTabBarContext = () => {
  return React.useContext(ActiveTabBarContext);
};

export { ActiveTabBarContextProvider, useActiveTabBarContext };

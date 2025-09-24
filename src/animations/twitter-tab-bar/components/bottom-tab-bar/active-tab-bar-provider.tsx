import {
  createContext,
  type FC,
  type ReactNode,
  useContext,
  useMemo,
} from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { makeMutable, useSharedValue } from 'react-native-reanimated';

type ActiveTabBarContextType = {
  isActive: SharedValue<boolean>;
};

const ActiveTabBarContext = createContext<ActiveTabBarContextType>({
  isActive: makeMutable(true),
});

type ActiveTabBarContextProviderProps = {
  children?: ReactNode;
};

const ActiveTabBarContextProvider: FC<ActiveTabBarContextProviderProps> = ({
  children,
}) => {
  const isActive = useSharedValue(true);

  const value = useMemo(() => {
    return {
      isActive,
    };
  }, [isActive]);

  return (
    <ActiveTabBarContext.Provider value={value}>
      {children}
    </ActiveTabBarContext.Provider>
  );
};

const useActiveTabBarContext = () => {
  return useContext(ActiveTabBarContext);
};

export { ActiveTabBarContextProvider, useActiveTabBarContext };

import React, { useMemo } from 'react';
import type { SharedValue } from 'react-native-reanimated';
import { makeMutable, useSharedValue } from 'react-native-reanimated';

// Define the type for the ActiveTabBarContext
type ActiveTabBarContextType = {
  isActive: SharedValue<boolean>; // Animated shared value to track the active state
};

// Create the ActiveTabBarContext with the initial value of isActive as true
const ActiveTabBarContext = React.createContext<ActiveTabBarContextType>({
  isActive: makeMutable(true),
});

// Define the props for the ActiveTabBarContextProvider
type ActiveTabBarContextProviderProps = {
  children?: React.ReactNode; // Children elements to be wrapped within the context provider
};

// Create the ActiveTabBarContextProvider component
const ActiveTabBarContextProvider: React.FC<
  ActiveTabBarContextProviderProps
> = ({ children }) => {
  // Create a shared animated value 'isActive' and initialize it to true
  const isActive = useSharedValue(true);

  // Create the context value using useMemo to avoid unnecessary re-renders
  const value = useMemo(() => {
    return {
      isActive, // Provide the 'isActive' shared animated value to the context consumers
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Render the ActiveTabBarContextProvider with the provided children wrapped within the context
  return (
    <ActiveTabBarContext.Provider value={value}>
      {children}
    </ActiveTabBarContext.Provider>
  );
};

// Create the custom hook 'useActiveTabBarContext' to access the ActiveTabBarContext value
const useActiveTabBarContext = () => {
  return React.useContext(ActiveTabBarContext);
};

export { ActiveTabBarContextProvider, useActiveTabBarContext };

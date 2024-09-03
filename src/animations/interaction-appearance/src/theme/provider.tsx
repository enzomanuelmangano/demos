import {
  // I really like Restyle's theming system, so I'm using it here
  ThemeProvider as ShopifyThemeProvider,
  useTheme as useShopifyTheme,
} from '@shopify/restyle';
import type { SetStateAction } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

import type { Theme } from './palette';
import { DarkTheme, LightTheme } from './palette';

type ThemeProviderProps = {
  children: React.ReactNode;
};

const ThemeContext = React.createContext({
  theme: 'light' as 'light' | 'dark',
  setTheme: (() => {}) as React.Dispatch<SetStateAction<'light' | 'dark'>>,
});

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Normally it makes sense to use the device's color scheme
  // const theme = useColorScheme() === 'dark' ? DarkTheme : LightTheme;
  const [selectedTheme, setTheme] = useState<'light' | 'dark'>('light');

  const theme = selectedTheme === 'dark' ? DarkTheme : LightTheme;

  const value = useMemo(
    () => ({
      theme: selectedTheme,
      setTheme,
    }),
    [selectedTheme],
  );

  return (
    <ThemeContext.Provider value={value}>
      <ShopifyThemeProvider theme={theme}>{children}</ShopifyThemeProvider>
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const baseTheme = useShopifyTheme<Theme>();
  const { setTheme, theme } = React.useContext(ThemeContext);
  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, [setTheme]);

  return {
    ...baseTheme,
    theme,
    setTheme,
    toggleTheme,
  };
};

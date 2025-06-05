import type { SetStateAction } from 'react';
import React, { useCallback, useMemo, useState } from 'react';

import type { Theme } from './palette';
import { DarkTheme, LightTheme } from './palette';

type ThemeProviderProps = {
  children: React.ReactNode;
};

type ThemeContextType = {
  theme: 'light' | 'dark';
  setTheme: React.Dispatch<SetStateAction<'light' | 'dark'>>;
  toggleTheme: () => void;
  colors: Theme['colors'];
  spacing: Theme['spacing'];
  textVariants: Theme['textVariants'];
};

const ThemeContext = React.createContext<ThemeContextType>({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  colors: LightTheme.colors,
  spacing: LightTheme.spacing,
  textVariants: LightTheme.textVariants,
});

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Normally it makes sense to use the device's color scheme
  // const theme = useColorScheme() === 'dark' ? DarkTheme : LightTheme;
  const [selectedTheme, setTheme] = useState<'light' | 'dark'>('light');

  const currentTheme = selectedTheme === 'dark' ? DarkTheme : LightTheme;

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const value = useMemo(
    () => ({
      theme: selectedTheme,
      setTheme,
      toggleTheme,
      colors: currentTheme.colors,
      spacing: currentTheme.spacing,
      textVariants: currentTheme.textVariants,
    }),
    [selectedTheme, currentTheme, toggleTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = React.useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
